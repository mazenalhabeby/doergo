/**
 * API Client for HBCField Backend
 *
 * Handles all HTTP communication with the API gateway.
 * Implements standard OAuth 2.0 token refresh with:
 * - Automatic 401 handling with token refresh and request retry
 * - Request queue to prevent multiple concurrent refresh attempts
 * - Proactive refresh before token expiry
 */

import { apiError } from './server-error';
import {
  TimeEntryStatus,
  BreakType,
  InvitationStatus,
  JoinRequestStatus,
  JoinPolicy,
  buildUrlWithQuery,
} from '@hbcfield/shared/client';
import type {
  CompanyLocation,
  TimeEntry,
  Break,
  BreakStatus,
  BreakSummary as SharedBreakSummary,
  AttendanceSummary as SharedAttendanceSummary,
  AttendanceQueryParams as SharedAttendanceQueryParams,
  PaginatedResponse,
  EmployeeProfile,
  EmployeeListItem,
  EmployeeStats,
  PerformanceMetrics,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  EmployeesQueryParams,
  Invitation,
  InvitationValidation,
  CreateInvitationInput,
  JoinRequest,
  OnboardingStatus,
  OrgCodeValidation,
  Shift,
  ShiftAssignment,
  SpaceRole,
  SpaceMember,
  SpaceRolePermissions,
  GeofenceExcursion,
} from '@hbcfield/shared/client';

// Re-export shared types for convenience
export type {
  CompanyLocation,
  TimeEntry,
  Break,
  BreakStatus,
  PaginatedResponse,
  EmployeeProfile,
  EmployeeListItem,
  EmployeeStats,
  PerformanceMetrics,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  EmployeesQueryParams,
  Invitation,
  InvitationValidation,
  CreateInvitationInput,
  JoinRequest,
  OnboardingStatus,
  OrgCodeValidation,
};

// API base URL — proxy through Next.js for regular requests
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
// Direct gateway URL for auth endpoints (cookies need to go directly to the server that sets them)
const AUTH_BASE_URL = process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:4000/api/v1';

interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  status: number;
  /**
   * A stable identifier for a refusal, when the server sent one.
   *
   * The server's `error` text is English and always will be — it is written
   * where no locale is known. A code plus its params lets the client say the
   * same thing in the reader's language, and falls back to the English text
   * for every refusal that does not have one yet.
   */
  errorCode?: string;
  errorParams?: Record<string, unknown>;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// Token storage — the short-lived ACCESS token lives in localStorage (for page
// reload persistence); the long-lived REFRESH token is kept ONLY in the gateway's
// httpOnly cookie and is never readable from JS (so XSS can't steal a durable
// credential). The browser sends the cookie automatically on credentialed
// requests to /auth/refresh and /auth/logout.
const ACCESS_TOKEN_KEY = 'hbcfield_access_token';

// In-memory access token (primary) + localStorage backup for page reload persistence
let memoryAccessToken: string | null = null;

// Token refresh state management - shared promise ensures only one refresh at a time
let refreshPromise: Promise<boolean> | null = null;

// Get access token (memory first, then localStorage fallback)
export function getAccessToken(): string | null {
  if (memoryAccessToken) return memoryAccessToken;
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

// Store the access token (refresh token is set as an httpOnly cookie by the gateway).
export function setTokens(tokens: AuthTokens): void {
  memoryAccessToken = tokens.accessToken;
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
}

// Clear the access token (logout also clears the httpOnly cookie server-side).
export function clearTokens(): void {
  memoryAccessToken = null;
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  // Best-effort cleanup of any legacy refresh token from before the cookie migration.
  localStorage.removeItem('hbcfield_refresh_token');
}

// Check if we have an access token (refresh token is in cookie, can't check from JS)
export function hasTokens(): boolean {
  return !!getAccessToken();
}

// Request timeout in milliseconds
const REQUEST_TIMEOUT = 15000;

// Refresh access token using refresh token
export async function refreshTokens(): Promise<boolean> {
  return refreshAccessToken();
}

/**
 * Refresh access token with queue management
 * Uses a shared promise to ensure only one refresh request is made
 */
function refreshAccessToken(): Promise<boolean> {
  // If a refresh is already in progress, return the existing promise
  if (refreshPromise) {
    return refreshPromise;
  }

  // Create the promise IMMEDIATELY and store it
  // This ensures any concurrent calls will get the same promise
  refreshPromise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      // The refresh token rides in the httpOnly cookie (credentials: 'include').
      // No token is read from JS or sent in the body.
      const response = await fetch(`${AUTH_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'web',
        },
        credentials: 'include',
        body: JSON.stringify({}),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const result = await response.json();

      // Check both HTTP status and response body for success
      if (!response.ok || !result.success) {
        clearTokens();
        return false;
      }

      // We only need the new access token; the rotated refresh token is set
      // back as an httpOnly cookie by the gateway.
      const data = result.data;
      if (!data?.accessToken) {
        clearTokens();
        return false;
      }

      setTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });

      return true;
    } catch (error) {
      clearTimeout(timeoutId);
      clearTokens();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Generic API request function with automatic token refresh
 *
 * OAuth 2.0 Standard Flow:
 * 1. Make request with access token
 * 2. If 401 (unauthorized), attempt to refresh tokens
 * 3. If refresh successful, retry original request with new token
 * 4. If refresh fails (expired refresh token), redirect to login
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  retry = true
): Promise<ApiResponse<T>> {
  const accessToken = getAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Names this client so the Access Profile's Web / Mobile choice can be
    // enforced server-side — it was previously stored and checked nowhere.
    'X-Client-Platform': 'web',
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include', // Always send httpOnly cookies
    });

    // Handle 401 - Automatic token refresh
    if (response.status === 401 && retry) {
      // Attempt refresh — refresh token is in httpOnly cookie
      const refreshed = await refreshAccessToken();

      if (refreshed) {
        // Retry the original request with new token
        return apiRequest<T>(endpoint, options, false);
      }

      // Refresh failed — clear tokens, let auth context detect and redirect gracefully
      clearTokens();
      return { status: 401, error: 'Session expired. Please log in again.' };
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        status: response.status,
        error: data?.message || 'Request failed',
        // A server refusal can carry a stable code and values to interpolate, so
        // the client can say it in the reader's language. Absent on most errors;
        // `error` remains the fallback and nothing depends on these being here.
        errorCode: typeof data?.code === 'string' ? data.code : undefined,
        errorParams: data?.params && typeof data.params === 'object' ? data.params : undefined,
      };
    }

    return { status: response.status, data };
  } catch (error) {
    return {
      status: 500,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// API methods
export const api = {
  get: <T>(endpoint: string) => apiRequest<T>(endpoint, { method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown) =>
    apiRequest<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(endpoint: string, body?: unknown) =>
    apiRequest<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(endpoint: string, body?: unknown) =>
    apiRequest<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string) => apiRequest<T>(endpoint, { method: 'DELETE' }),
};

// Helper to create fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      // Always send/receive the httpOnly refresh-token cookie. Without this the
      // browser discards the Set-Cookie from a cross-origin login/register
      // response, so refresh later has no cookie → every refresh 401s → logout.
      credentials: 'include',
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection and try again.');
    }
    throw new Error('Unable to connect to server. Please check if the API is running.');
  }
}

// Auth-specific API methods
export const authApi = {
  login: async (email: string, password: string, rememberMe = false) => {
    const response = await fetchWithTimeout(`${AUTH_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // client:'web' → session length honors rememberMe (24h default / 30d).
      body: JSON.stringify({ email, password, rememberMe, client: 'web' }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Login failed');
    }

    // API returns { success: true, data: { user, accessToken, refreshToken } }.
    // The refresh token is also set as an httpOnly cookie by the gateway; we only
    // need the access token client-side.
    const data = result.data;

    if (!data?.accessToken) {
      throw new Error('Invalid server response');
    }

    setTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });

    return data;
  },

  logout: async () => {
    // The refresh token is in the httpOnly cookie; the gateway reads it from the
    // cookie (credentials are sent by api.post) and clears it server-side.
    await api.post('/auth/logout', {}).catch(() => {});
    clearTokens();
  },

  getMe: async () => {
    const response = await api.get<{
      success: boolean;
      data: {
        id: string;
        email: string;
        role: string;
        firstName: string;
        lastName: string;
        organizationId?: string;
        organizationTimezone?: string | null;
        onboardingCompleted?: boolean;
        avatarUrl?: string | null;
        // Permission fields
        canCreateTasks: boolean;
        taskCreationScope?: string;
        canViewAllTasks: boolean;
        canAssignTasks: boolean;
        canManageUsers: boolean;
        enabledModules?: string[] | Record<string, unknown>;
        orgModules?: string[];
      };
    }>('/auth/me');

    if (response.error) {
      throw new Error(response.error);
    }

    // API returns { success: true, data: { user info } }
    return response.data?.data;
  },

  register: async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    // Optional: when omitted the backend creates an "orphan" user (no org) that
    // must complete onboarding (create org / join by code / accept invitation).
    companyName?: string;
    firstSpaceName?: string;
  }) => {
    // Note: Role is NOT sent - backend always sets it to ADMIN for security
    const response = await fetchWithTimeout(`${AUTH_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Registration failed');
    }

    return result;
  },

  forgotPassword: async (email: string) => {
    const response = await fetchWithTimeout(`${AUTH_BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to send reset email');
    }

    return result;
  },

  resetPassword: async (token: string, newPassword: string) => {
    const response = await fetchWithTimeout(`${AUTH_BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to reset password');
    }

    return result;
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await api.post<{ success: boolean; message: string }>('/auth/change-password', {
      currentPassword,
      newPassword,
    });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },
};

// Task types
/** This year's vacation allowance for one person. */
export interface LeaveBalance {
  year: number;
  allowance: number;
  taken: number;
  pending: number;
  remaining: number;
  /** True when this is a joiner's first year and the allowance is a share. */
  prorated?: boolean;
  /** What a full year would be — so the screen can show the share honestly. */
  fullAllowance?: number;
  startedOn?: string | null;
}

export interface TaskAssignee {
  id: string;
  userId: string;
  role: 'LEAD' | 'MEMBER';
  user: { id: string; firstName: string; lastName: string; avatarUrl?: string | null };
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  isCompleted: boolean;
  position: number;
  createdAt: string;
}

export interface Phase {
  id: string;
  name: string;
  description: string | null;
  color: string;
  type: string;
  organizationId: string;
  startDate: string | null;
  endDate: string | null;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Sprint {
  id: string;
  name: string;
  goal: string | null;
  organizationId: string;
  startDate: string;
  endDate: string;
  status: 'PLANNING' | 'ACTIVE' | 'COMPLETED';
  position: number;
  createdAt: string;
  updatedAt: string;
  tasks?: Task[];
}

export interface SprintReport {
  id: string;
  sprintId: string;
  committedPoints: number;
  completedPoints: number;
  committedTasks: number;
  completedTasks: number;
  carriedOverTasks: number;
  carriedOverPoints: number;
  addedMidSprint: number;
  removedMidSprint: number;
  velocity: number;
  dailyBurndown: { date: string; remaining: number; ideal: number }[];
}

export const STORY_POINT_OPTIONS = [1, 2, 3, 5, 8, 13, 21] as const;

export interface TaskDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: 'FINISH_TO_START' | 'START_TO_START' | 'FINISH_TO_FINISH' | 'START_TO_FINISH';
  lagDays: number;
  createdAt: string;
  predecessor?: { id: string; title: string; status: string };
  successor?: { id: string; title: string; status: string };
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  startDate: string | null;
  estimatedHours: number | null;
  locationLat: number | null;
  locationLng: number | null;
  locationAddress: string | null;
  organizationId: string;
  createdById: string;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
  // Route tracking fields
  routeStartedAt: string | null;
  routeEndedAt: string | null;
  routeDistance: number | null;
  // DB-derived task-time anchors (timer counts from acceptedAt; freezes at completedAt)
  acceptedAt?: string | null;
  completedAt?: string | null;
  // Hierarchy fields
  parentId?: string | null;
  depth?: number;
  position?: number;
  phaseId?: string | null;
  sprintId?: string | null;
  workflowId?: string | null;
  // Agile fields
  storyPoints?: number | null;
  epicId?: string | null;
  epic?: Epic | null;
  // Relations
  subtasks?: Task[];
  parent?: { id: string; title: string } | null;
  phase?: Phase | null;
  sprint?: Sprint | null;
  predecessors?: TaskDependency[];
  successors?: TaskDependency[];
  _count?: { subtasks?: number };
  // Space
  spaceId?: string | null;
  space?: { id: string; name: string } | null;
  // Multi-assignee & checklist
  assignees?: TaskAssignee[];
  checklistItems?: ChecklistItem[];
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    avatarUrl?: string | null;
  };
  assignedTo?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    avatarUrl?: string | null;
  } | null;
  organization?: {
    id: string;
    name: string;
  };
  assetId?: string | null;
  asset?: {
    id: string;
    name: string;
    serialNumber: string | null;
    model: string | null;
    manufacturer: string | null;
    status: string;
    category?: {
      id: string;
      name: string;
      icon: string | null;
      color: string | null;
    } | null;
    type?: {
      id: string;
      name: string;
    } | null;
  } | null;
  comments?: Comment[];
  attachments?: Attachment[];
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  uploadedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface TaskEvent {
  id: string;
  eventType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface TasksListResponse {
  success: boolean;
  data: Task[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TaskResponse {
  success: boolean;
  data: Task;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  startDate?: string;
  estimatedHours?: number;
  assigneeIds?: string[];
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  assetId?: string;
  phaseId?: string;
  sprintId?: string;
  workflowId?: string;
  parentId?: string;
  storyPoints?: number;
  epicId?: string;
  spaceId?: string;
  customerId?: string;
  unitId?: string;
  checklistItems?: { text: string }[];
  customFieldValues?: { definitionId: string; value: string }[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  startDate?: string;
  estimatedHours?: number;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  assetId?: string | null;
  phaseId?: string | null;
  sprintId?: string | null;
  storyPoints?: number | null;
  epicId?: string | null;
  spaceId?: string | null;
  workflowId?: string | null;
  position?: number;
}

export interface TasksQueryParams {
  status?: string;
  /** A tab group — several statuses at once. Sent comma-separated. */
  statuses?: string[];
  priority?: string;
  /** Free-text over title and description, matched server-side. */
  search?: string;
  /** Sprint id, or 'none' for the backlog (tasks in no sprint). */
  sprintId?: string;
  /** Epic id, or 'none' for tasks in no epic. */
  epicId?: string;
  page?: number;
  limit?: number;
  /** Scope tasks to a single space. Used by the guest shared-space view. */
  spaceId?: string;
  /** Scope tasks to a single CRM customer (their record's task feed). */
  customerId?: string;
  /** Scope tasks to a single apartment/unit (the apartment's history). */
  unitId?: string;
}

// Suggested employee response types
export interface SuggestedEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  specialty: string | null | undefined;
  workMode?: string;
  rating: number;
  ratingCount: number;
  activeTaskCount: number;
  todayTaskCount: number;
  maxDailyJobs: number;
  distanceKm: number | null;
  hasLocation: boolean;
  lastLocationUpdatedAt: string | null;
  score: number;
  scoreBreakdown: {
    distance: number;
    availability: number;
    specialization: number;
    workload: number;
    rating: number;
  };
}

export interface SuggestedEmployeesResponse {
  taskId: string;
  technicians: SuggestedEmployee[];
  suggestedTechnicianId: string | null;
}

/** @deprecated Use SuggestedEmployee */
export type SuggestedTechnician = SuggestedEmployee;
/** @deprecated Use SuggestedEmployeesResponse */
export type SuggestedTechniciansResponse = SuggestedEmployeesResponse;

// Tasks API methods
// User/Worker types
export interface Worker {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  // Mobile Access Profile (JSON) — whether this worker can receive/see tasks.
  enabledModules?: unknown;
  lastLocation?: {
    lat: number;
    lng: number;
    accuracy: number;
    updatedAt: string;
  } | null;
}

// Users API methods
export interface InboxNotification {
  id: string;
  eventType: string;
  payload: { title?: string; body?: string; link?: string | null; [k: string]: unknown } | null;
  readAt: string | null;
  createdAt: string;
}

export const usersApi = {
  // In-app notification inbox — persisted notifications + unread count.
  getNotifications: async (limit = 30) => {
    const response = await api.get<{ data: { items: InboxNotification[]; unread: number } }>(
      `/users/me/notifications?limit=${limit}`,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data ?? { items: [], unread: 0 };
  },

  // Mark notifications read (all unread, or specific ids).
  markNotificationsRead: async (ids?: string[]) => {
    const response = await api.post<{ success: boolean }>(`/users/me/notifications/read`, ids ? { ids } : {});
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  // Update your OWN profile (any authenticated user — no admin permission).
  updateMe: async (data: { firstName?: string; lastName?: string; presence?: 'AVAILABLE' | 'BUSY' | 'AWAY' | null; timeFormat?: '12h' | '24h'; guidesSeen?: boolean }) => {
    const response = await api.patch<{ success: boolean; data: { id: string; firstName: string; lastName: string } }>(
      '/users/me',
      data,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  // Change your OWN email — requires current password, enforces uniqueness.
  updateMyEmail: async (data: { newEmail: string; currentPassword: string }) => {
    const response = await api.patch<{ success: boolean; data: { id: string; email: string } }>(
      '/users/me/email',
      data,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  // Get all employees (DISPATCHER only)
  getWorkers: async () => {
    const response = await api.get<{ success: boolean; data: Worker[] }>('/users/workers');

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Get user by ID
  getById: async (id: string) => {
    const response = await api.get<{ success: boolean; data: Worker }>(`/users/${id}`);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Upload avatar image directly to the API gateway
  uploadAvatar: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const token = getAccessToken();
    const response = await fetch(`${API_BASE_URL}/users/avatar/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.message || 'Upload failed');
    }

    const data = await response.json();
    return data.data as { avatarUrl: string };
  },

  // Remove avatar
  removeAvatar: async () => {
    const response = await api.delete<{ success: boolean }>('/users/avatar');
    if (response.error) throw new Error(response.error);
    return response.data;
  },
};

// Status counts response type
export interface StatusCountsResponse {
  success: boolean;
  data: Record<string, number>;
}

export const tasksApi = {
  // Get task counts grouped by status
  /** Task counts grouped by status (default) or by space, over everything the
   *  caller may see — not just the loaded page. */
  getStatusCounts: async (params?: { groupBy?: 'status' | 'space'; spaceId?: string }) => {
    const response = await api.get<StatusCountsResponse>(
      buildUrlWithQuery('/tasks/counts', { groupBy: params?.groupBy, spaceId: params?.spaceId }),
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data || {};
  },

  // Get all tasks with optional filters
  list: async (params?: TasksQueryParams) => {
    const endpoint = buildUrlWithQuery('/tasks', {
      status: params?.status !== 'all' ? params?.status : undefined,
      // The server filters on these; doing it in the browser only ever filtered
      // the page that happened to be loaded.
      statuses: params?.statuses?.length ? params.statuses.join(',') : undefined,
      search: params?.search?.trim() || undefined,
      sprintId: params?.sprintId !== 'all' ? params?.sprintId : undefined,
      epicId: params?.epicId !== 'all' ? params?.epicId : undefined,
      priority: params?.priority !== 'all' ? params?.priority : undefined,
      page: params?.page,
      limit: params?.limit,
      // The server scopes to this space (incl. cross-org shared spaces).
      spaceId: params?.spaceId,
      customerId: params?.customerId,
      unitId: params?.unitId,
    });

    const response = await api.get<TasksListResponse>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // Get a single task by ID
  getById: async (id: string) => {
    const response = await api.get<TaskResponse>(`/tasks/${id}`);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Create a new task
  create: async (input: CreateTaskInput) => {
    const response = await api.post<TaskResponse>('/tasks', input);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Update a task
  update: async (id: string, input: UpdateTaskInput) => {
    const response = await api.put<TaskResponse>(`/tasks/${id}`, input);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Delete a task
  delete: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(`/tasks/${id}`);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // Assign a task to an employee (DISPATCHER only)
  assign: async (id: string, workerId: string) => {
    const response = await api.patch<TaskResponse>(`/tasks/${id}/assign`, { workerId });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Update task status (TECHNICIAN only)
  updateStatus: async (id: string, status: string, reason?: string) => {
    const response = await api.patch<TaskResponse>(`/tasks/${id}/status`, { status, reason });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Get task timeline/activity
  getTimeline: async (id: string) => {
    const response = await api.get<{ success: boolean; data: TaskEvent[] }>(`/tasks/${id}/timeline`);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Add a comment to a task
  addComment: async (taskId: string, content: string) => {
    const response = await api.post<{ success: boolean; data: Comment }>(`/tasks/${taskId}/comments`, { content });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Get task comments
  getComments: async (taskId: string) => {
    const response = await api.get<{ success: boolean; data: Comment[] }>(`/tasks/${taskId}/comments`);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // ── Assignees ──────────────────────────────────────────────────────────────
  addAssignee: async (taskId: string, userId: string, role?: string) => {
    const response = await api.post<{ success: boolean; data: TaskAssignee }>(
      `/tasks/${taskId}/assignees`,
      { userId, role: role || 'MEMBER' },
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  removeAssignee: async (taskId: string, userId: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(
      `/tasks/${taskId}/assignees/${userId}`,
    );
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  // ── Checklist ─────────────────────────────────────────────────────────────
  addChecklistItem: async (taskId: string, text: string) => {
    const response = await api.post<{ success: boolean; data: ChecklistItem }>(
      `/tasks/${taskId}/checklist`,
      { text },
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  updateChecklistItem: async (
    taskId: string,
    itemId: string,
    data: { text?: string; isCompleted?: boolean },
  ) => {
    const response = await api.patch<{ success: boolean; data: ChecklistItem }>(
      `/tasks/${taskId}/checklist/${itemId}`,
      data,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  deleteChecklistItem: async (taskId: string, itemId: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(
      `/tasks/${taskId}/checklist/${itemId}`,
    );
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  reorderChecklist: async (taskId: string, itemIds: string[]) => {
    const response = await api.patch<{ success: boolean; data: ChecklistItem[] }>(
      `/tasks/${taskId}/checklist/reorder`,
      { itemIds },
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  // ── Subtasks ─────────────────────────────────────────────────────────────
  createSubtask: async (parentId: string, data: CreateTaskInput) => {
    const response = await api.post<TaskResponse>(`/tasks/${parentId}/subtasks`, data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  getSubtasks: async (taskId: string) => {
    const response = await api.get<{ success: boolean; data: Task[] }>(`/tasks/${taskId}/subtasks`);
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  // ── Dependencies ────────────────────────────────────────────────────────
  addDependency: async (taskId: string, predecessorId: string, type?: string, lagDays?: number) => {
    const response = await api.post<{ success: boolean; data: TaskDependency }>(
      `/tasks/${taskId}/dependencies`,
      { predecessorId, type, lagDays },
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  removeDependency: async (taskId: string, depId: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(
      `/tasks/${taskId}/dependencies/${depId}`,
    );
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  // Get suggested employees for a task (with scoring)
  getSuggestedEmployees: async (taskId: string) => {
    const response = await api.get<{ success: boolean; data: SuggestedEmployeesResponse }>(
      `/tasks/${taskId}/suggested-technicians`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },
};

// Task Attachments API (presigned URL upload flow)
export const taskAttachmentsApi = {
  getPresignedUrl: async (taskId: string, fileName: string, fileType: string) => {
    const response = await api.post<{
      success: boolean;
      data: { uploadUrl: string; fileKey: string; fileUrl: string; expiresIn: number; maxFileSize: number };
    }>(`/tasks/${taskId}/attachments/presign`, { fileName, fileType });
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data?.data;
  },

  confirmUpload: async (
    taskId: string,
    data: { fileName: string; fileUrl: string; fileType: string; fileSize: number }
  ) => {
    const response = await api.post<{ success: boolean; data: Attachment }>(
      `/tasks/${taskId}/attachments`,
      data
    );
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data?.data;
  },

  getAttachments: async (taskId: string) => {
    const response = await api.get<{ success: boolean; data: Attachment[] }>(
      `/tasks/${taskId}/attachments`
    );
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data?.data || [];
  },

  delete: async (taskId: string, attachmentId: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(
      `/tasks/${taskId}/attachments/${attachmentId}`
    );
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },
};

// ── Session work-log ("what I did today") ──────────────────────────────────
export interface WorkLogAttachment {
  id: string; fileKey: string; fileUrl: string; url?: string; fileName: string;
  fileSize: number; mimeType: string; width?: number | null; height?: number | null; createdAt: string;
}
/**
 * An attachment as the CLIENT sends it, before the server stores it.
 *
 * `id` and `createdAt` belong to the stored row, so a payload cannot be typed
 * with them — the shape going up and the shape coming back are not the same
 * shape, which is exactly what `any[]` on both sides was hiding.
 */
export type WorkLogAttachmentInput = Omit<WorkLogAttachment, 'id' | 'createdAt'>;

export interface WorkLogNote {
  id: string; timeEntryId: string; userId: string; body: string; at: string; taskId?: string | null;
  attachments: WorkLogAttachment[]; createdAt: string;
  author?: { id: string; name: string }; // who wrote it (member or manager)
  byManager?: boolean; // true when a manager/admin wrote it, not the session's member
}

// ── Shift Issues (blockers) ──────────────────────────────────────────────────
export type ShiftIssueStatus = "OPEN" | "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "CANCELED"
export type ShiftIssueSeverity = "LOW" | "MEDIUM" | "HIGH" | "URGENT"

export interface ShiftIssueEvent {
  id: string; type: string; actorId?: string | null; actorName?: string; body?: string | null;
  metadata?: Record<string, unknown>; attachments?: WorkLogAttachment[]; at: string
}
export interface ShiftIssue {
  id: string; organizationId: string; title: string; description?: string | null;
  severity: ShiftIssueSeverity; status: ShiftIssueStatus;
  reportedById: string; reporterName?: string; assignedToId?: string | null; assigneeName?: string | null;
  spaceId?: string | null; timeEntryId?: string | null;
  resolutionNote?: string | null; createdAt: string; updatedAt: string;
  eventCount?: number; thread?: ShiftIssueEvent[]
}

export const shiftIssuesApi = {
  list: async (params?: { status?: string; scope?: string }): Promise<ShiftIssue[]> => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set("status", params.status)
    if (params?.scope) qs.set("scope", params.scope)
    const suffix = qs.toString() ? `?${qs.toString()}` : ""
    const res = await api.get<{ data: ShiftIssue[] }>(`/shift-issues${suffix}`)
    if (res.error) throw new Error(res.error)
    return res.data?.data ?? []
  },
  get: async (id: string): Promise<ShiftIssue> => {
    const res = await api.get<{ data: ShiftIssue }>(`/shift-issues/${id}`)
    if (res.error) throw new Error(res.error)
    return res.data!.data
  },
  create: async (input: { title: string; description?: string; severity?: string; timeEntryId?: string; spaceId?: string; attachments?: WorkLogAttachmentInput[] }): Promise<ShiftIssue> => {
    const res = await api.post<{ data: ShiftIssue }>(`/shift-issues`, input)
    if (res.error) throw new Error(res.error)
    return res.data!.data
  },
  message: async (id: string, input: { body?: string; attachments?: WorkLogAttachmentInput[] }): Promise<ShiftIssueEvent> => {
    const res = await api.post<{ data: ShiftIssueEvent }>(`/shift-issues/${id}/messages`, input)
    if (res.error) throw new Error(res.error)
    return res.data!.data
  },
  acknowledge: async (id: string) => {
    const res = await api.post<{ data: ShiftIssue }>(`/shift-issues/${id}/acknowledge`, {})
    if (res.error) throw new Error(res.error)
    return res.data!.data
  },
  assign: async (id: string, assignToId: string) => {
    const res = await api.post<{ data: ShiftIssue }>(`/shift-issues/${id}/assign`, { assignToId })
    if (res.error) throw new Error(res.error)
    return res.data!.data
  },
  setStatus: async (id: string, status: string, note?: string) => {
    const res = await api.post<{ data: ShiftIssue }>(`/shift-issues/${id}/status`, { status, note })
    if (res.error) throw new Error(res.error)
    return res.data!.data
  },
  presignAttachment: async (id: string, fileName: string, mimeType: string) => {
    const res = await api.post<{ data: { uploadUrl: string; fileKey: string; fileUrl: string; expiresIn: number; maxFileSize: number } }>(`/shift-issues/${id}/attachments/presign`, { fileName, mimeType })
    if (res.error) throw new Error(res.error)
    return res.data!.data
  },
}

export const worklogApi = {
  list: async (entryId: string): Promise<WorkLogNote[]> => {
    const res = await api.get<{ data: WorkLogNote[] }>(`/attendance/entries/${entryId}/worklog`);
    if (res.error) throw new Error(res.error);
    return res.data?.data ?? [];
  },
  addNote: async (entryId: string, input: { body: string; at?: string; taskId?: string }): Promise<WorkLogNote> => {
    const res = await api.post<{ data: WorkLogNote }>(`/attendance/entries/${entryId}/worklog`, input);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  deleteNote: async (noteId: string) => {
    const res = await api.delete<{ data: { success: boolean } }>(`/attendance/worklog/${noteId}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
  presignAttachment: async (noteId: string, fileName: string, mimeType: string) => {
    const res = await api.post<{ data: { uploadUrl: string; fileKey: string; fileUrl: string; expiresIn: number; maxFileSize: number } }>(
      `/attendance/worklog/${noteId}/attachments/presign`, { fileName, mimeType });
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  confirmAttachment: async (noteId: string, data: { fileKey: string; fileUrl: string; fileName: string; fileSize: number; mimeType: string; width?: number; height?: number }): Promise<WorkLogAttachment> => {
    const res = await api.post<{ data: WorkLogAttachment }>(`/attendance/worklog/${noteId}/attachments`, data);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  deleteAttachment: async (attachmentId: string) => {
    const res = await api.delete<{ data: { success: boolean } }>(`/attendance/worklog/attachments/${attachmentId}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
};

// Upload file to S3 presigned URL (browser)
export function uploadToS3(
  url: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

// Worker location types for tracking
export interface WorkerLocation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  lat: number;
  lng: number;
  accuracy?: number;
  updatedAt?: string;
  currentTaskId?: string;
  currentTask?: {
    id: string;
    title: string;
    status: string;
  };
}

// Route tracking types
export interface RoutePoint {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp: string;
}

export interface TaskRoute {
  taskId: string;
  workerId: string | null;
  status: string;
  startTime: string | null;
  endTime: string | null;
  duration: number | null; // seconds
  distance: number | null; // meters
  points: RoutePoint[];
  /** Road-snapped path [lat, lng], computed server-side. Null when route
   *  matching isn't configured — the map then draws the raw points. */
  matchedPath?: [number, number][] | null;
}

export interface WorkerCurrentRoute {
  taskId: string;
  taskTitle: string;
  startTime: string | null;
  duration: number | null; // seconds
  distance: number; // meters
  destination: { lat: number; lng: number } | null;
  points: RoutePoint[];
}

// Tracking API methods (DISPATCHER only)
export const trackingApi = {
  // Get all active worker locations
  getWorkers: async () => {
    const response = await api.get<{ success: boolean; data: WorkerLocation[] }>('/tracking/workers');

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data || [];
  },

  // Live worker locations for a cross-org shared space (guest view; showTracking).
  getSpaceWorkers: async (spaceId: string) => {
    const response = await api.get<{ success: boolean; data: WorkerLocation[] }>(`/tracking/spaces/${spaceId}/workers`);
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  // Get specific worker location
  getWorkerLocation: async (workerId: string) => {
    const response = await api.get<{ success: boolean; data: WorkerLocation }>(`/tracking/workers/${workerId}`);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Get worker's current EN_ROUTE journey
  getWorkerCurrentRoute: async (workerId: string) => {
    const response = await api.get<{ success: boolean; data: WorkerCurrentRoute | null }>(
      `/tracking/workers/${workerId}/current-route`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Get full route for a completed task
  getTaskRoute: async (taskId: string) => {
    const response = await api.get<{ success: boolean; data: TaskRoute | null }>(
      `/tracking/tasks/${taskId}/route`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },
};

// ============================================
// ASSET MANAGEMENT TYPES & API
// ============================================

export type AssetStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'RETIRED';

export interface AssetCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  organizationId: string;
  spaceId?: string | null;
  /** What this kind's records look like — read via normalizeKindShape(). */
  config?: unknown;
  createdAt: string;
  updatedAt: string;
  _count?: {
    types: number;
    assets: number;
  };
}

export interface AssetType {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  createdAt: string;
  updatedAt: string;
  category?: AssetCategory;
  _count?: {
    assets: number;
  };
}

export interface Asset {
  id: string;
  name: string;
  serialNumber: string | null;
  model: string | null;
  manufacturer: string | null;
  status: AssetStatus;
  installDate: string | null;
  warrantyExpiry: string | null;
  locationAddress: string | null;
  locationLat: number | null;
  locationLng: number | null;
  notes: string | null;
  organizationId: string;
  categoryId: string | null;
  typeId: string | null;
  createdAt: string;
  updatedAt: string;
  category?: AssetCategory | null;
  type?: AssetType | null;
  _count?: {
    tasks: number;
  };
}

export interface MaintenanceHistoryItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  completedAt: string | null;
  createdAt: string;
  assignedTo: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  routeDistance: number | null;
  // Duration calculated from events or route data
  duration?: number | null;
}

export interface AssetListRow {
  id: string;
  list: string;
  values: Record<string, string>;
  position: number;
}

export interface AssetMoneyEntry {
  id: string;
  category: string;
  direction: 'IN' | 'OUT';
  amountCents: number;
  note: string | null;
  occurredAt: string;
  authorId: string | null;
}

export interface AssetMoneySummary {
  entries: AssetMoneyEntry[];
  totals: { inCents: number; outCents: number; netCents: number };
}

export interface AssetActivity {
  id: string;
  type: string;
  body: string | null;
  authorId: string | null;
  author?: { id: string; firstName: string; lastName: string } | null;
  metadata?: unknown;
  createdAt: string;
}

export interface CreateAssetCategoryInput {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  /** The space this kind belongs to. */
  spaceId?: string;
  /** What this kind's records look like. */
  config?: unknown;
}

export interface UpdateAssetCategoryInput {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface CreateAssetTypeInput {
  name: string;
  description?: string;
}

export interface UpdateAssetTypeInput {
  name?: string;
  description?: string;
}

export interface CreateAssetInput {
  name: string;
  serialNumber?: string;
  model?: string;
  manufacturer?: string;
  status?: AssetStatus;
  installDate?: string;
  warrantyExpiry?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  notes?: string;
  categoryId?: string;
  typeId?: string;
  /** Member who holds this (clears any client). */
  holderUserId?: string | null;
  /** Client who holds this (clears any member). */
  customerId?: string | null;
  /** Values for the fields this record's kind asks for. */
  details?: { label: string; value: string }[];
  /** Who holds it — one, or several when the type allows it. */
  holders?: AssetHolderInput[];
}

/** One holder on an asset: a member OR a client, never both. */
export interface AssetHolderInput {
  userId?: string | null;
  customerId?: string | null;
}

export interface UpdateAssetInput {
  name?: string;
  serialNumber?: string;
  model?: string;
  manufacturer?: string;
  status?: AssetStatus;
  installDate?: string;
  warrantyExpiry?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  notes?: string;
  categoryId?: string | null;
  typeId?: string | null;
  /** Who holds it — one, or several when the type allows it. */
  holders?: AssetHolderInput[];
}

/** One counted module's numbers — the same shape for assets, clients and portals. */
export interface ModuleUsageCounts {
  total: number;
  /** Records in no space — billed by nobody. For assets, listed by `getOrphans`. */
  unassigned: number;
  /** spaceId → how many. */
  spaces: Record<string, number>;
}

/**
 * What each counted module has in it — see `assetsApi.getUsage`.
 *
 * The asset numbers are repeated at the top level because the orphan card and
 * the space header read them there; `modules` is the shape everything new
 * should use, keyed by the same module keys the pricing ladders are.
 */
export interface AssetUsage extends ModuleUsageCounts {
  modules?: Record<string, ModuleUsageCounts>;
}

/** An asset that belongs to no space — see `assetsApi.getOrphans`. */
export interface OrphanAsset {
  id: string;
  name: string;
  status: AssetStatus;
  serialNumber: string | null;
  createdAt: string;
  category: { id: string; name: string } | null;
  type: { id: string; name: string } | null;
  _count: { tasks: number };
}

export interface AssetsQueryParams {
  categoryId?: string;
  typeId?: string;
  status?: AssetStatus;
  search?: string;
  page?: number;
  limit?: number;
}

// Assets API methods
export const assetsApi = {
  // ============================================
  // ORPHANS — assets that belong to no space
  // ============================================

  /**
   * Assets no space can show.
   *
   * A type carries the space, so an asset whose type has none (or which lost
   * its type) sits outside every space's Assets tab while still being billed.
   * This is the list that makes them reachable again.
   */
  getOrphans: async () => {
    const response = await api.get<{ success: boolean; data: OrphanAsset[] }>('/assets/orphans');

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data ?? [];
  },

  // ============================================
  // BILLING USAGE
  // ============================================

  /**
   * Billable assets per space — `{ total, unassigned, spaces: { [spaceId]: n } }`.
   *
   * Counts only. The ladder that turns them into money lives in
   * `@hbcfield/shared/client`, so the screen and the invoice cannot disagree.
   */
  getUsage: async () => {
    const response = await api.get<{ success: boolean; data: AssetUsage }>('/assets/usage');

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data ?? { total: 0, unassigned: 0, spaces: {} };
  },

  // ============================================
  // CATEGORIES
  // ============================================

  // Get all categories for organization
  // Pass a spaceId for THAT space's kinds; omit it for everything the org has.
  getCategories: async (spaceId?: string) => {
    const response = await api.get<{ success: boolean; data: AssetCategory[] }>(
      spaceId ? `/asset-categories?spaceId=${encodeURIComponent(spaceId)}` : '/asset-categories',
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data || [];
  },

  // Create a new category
  createCategory: async (input: CreateAssetCategoryInput) => {
    const response = await api.post<{ success: boolean; data: AssetCategory }>('/asset-categories', input);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Update a category
  updateCategory: async (id: string, input: UpdateAssetCategoryInput) => {
    const response = await api.patch<{ success: boolean; data: AssetCategory }>(`/asset-categories/${id}`, input);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Delete a category
  deleteCategory: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(`/asset-categories/${id}`);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // ============================================
  // TYPES
  // ============================================

  // Get types for a category
  getTypes: async (categoryId: string) => {
    const response = await api.get<{ success: boolean; data: AssetType[] }>(
      `/asset-categories/${categoryId}/types`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data || [];
  },

  // Create a new type in a category
  createType: async (categoryId: string, input: CreateAssetTypeInput) => {
    const response = await api.post<{ success: boolean; data: AssetType }>(
      `/asset-categories/${categoryId}/types`,
      input
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Update a type
  updateType: async (id: string, input: UpdateAssetTypeInput) => {
    const response = await api.patch<{ success: boolean; data: AssetType }>(`/asset-types/${id}`, input);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Delete a type
  deleteType: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(`/asset-types/${id}`);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // ============================================
  // ASSETS
  // ============================================

  // Get all assets with optional filters
  getAssets: async (params?: AssetsQueryParams) => {
    const endpoint = buildUrlWithQuery('/assets', params ?? {});

    const response = await api.get<{
      success: boolean;
      data: Asset[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // Get a single asset by ID
  getAsset: async (id: string) => {
    const response = await api.get<{ success: boolean; data: Asset }>(`/assets/${id}`);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Create a new asset
  createAsset: async (input: CreateAssetInput) => {
    const response = await api.post<{ success: boolean; data: Asset }>('/assets', input);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Update an asset
  updateAsset: async (id: string, input: UpdateAssetInput) => {
    const response = await api.patch<{ success: boolean; data: Asset }>(`/assets/${id}`, input);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Delete an asset
  deleteAsset: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(`/assets/${id}`);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // Get maintenance history for an asset (completed tasks)
  // What happened to one asset — notes people wrote, plus events such as it
  // changing hands.
  getActivities: async (assetId: string) => {
    const response = await api.get<{ success: boolean; data: AssetActivity[] }>(`/assets/${assetId}/activities`);
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  addActivity: async (assetId: string, body: string) => {
    const response = await api.post<{ success: boolean; data: AssetActivity }>(`/assets/${assetId}/activities`, { body });
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  // Rows of one table on a record — a machine's parts, an apartment's keys.
  getRows: async (assetId: string, list: string, params?: { search?: string; page?: number; limit?: number }) => {
    const qs = buildUrlWithQuery(`/assets/${assetId}/rows`, { list, ...(params ?? {}) });
    const response = await api.get<{ success: boolean; data: AssetListRow[]; meta?: { total: number; page: number; totalPages: number } }>(qs);
    if (response.error) throw new Error(response.error);
    return { rows: response.data?.data ?? [], meta: response.data?.meta };
  },

  addRow: async (assetId: string, list: string, values: Record<string, string>) => {
    const response = await api.post<{ success: boolean; data: AssetListRow }>(`/assets/${assetId}/rows`, { list, values });
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  updateRow: async (assetId: string, rowId: string, values: Record<string, string>) => {
    const response = await api.patch<{ success: boolean; data: AssetListRow }>(`/assets/${assetId}/rows/${rowId}`, { values });
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  removeRow: async (assetId: string, rowId: string) => {
    const response = await api.delete<{ success: boolean }>(`/assets/${assetId}/rows/${rowId}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  // The whole breakdown of one record, the path back up, and what it has cost
  // including everything inside it.


  // Money logged against one asset, with the totals for the whole ledger.
  getMoney: async (assetId: string) => {
    const response = await api.get<{ success: boolean; data: AssetMoneySummary }>(`/assets/${assetId}/money`);
    if (response.error) throw new Error(response.error);
    return response.data?.data ?? { entries: [], totals: { inCents: 0, outCents: 0, netCents: 0 } };
  },

  addMoney: async (assetId: string, input: { category: string; amountCents: number; note?: string; occurredAt?: string }) => {
    const response = await api.post<{ success: boolean; data: AssetMoneyEntry }>(`/assets/${assetId}/money`, input);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  removeMoney: async (assetId: string, entryId: string) => {
    const response = await api.delete<{ success: boolean }>(`/assets/${assetId}/money/${entryId}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  // scope 'all' includes work still open — the record page needs it, or a
  // technician cannot tell that a job is already raised.
  getAssetHistory: async (assetId: string, scope: 'done' | 'all' = 'all') => {
    const response = await api.get<{ success: boolean; data: MaintenanceHistoryItem[] }>(
      `/assets/${assetId}/history?scope=${scope}`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data || [];
  },
};

// ============================================
// SERVICE REPORTS TYPES & API
// ============================================

export type ReportAttachmentType = 'BEFORE' | 'AFTER';

export interface ReportAttachment {
  id: string;
  reportId: string;
  type: ReportAttachmentType;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  caption: string | null;
  createdAt: string;
}

export interface PartUsed {
  id: string;
  reportId: string;
  name: string;
  partNumber: string | null;
  quantity: number;
  unitCost: number | null;
  notes: string | null;
  createdAt: string;
}

export interface ServiceReport {
  id: string;
  taskId: string;
  assetId: string | null;
  summary: string;
  workPerformed: string | null;
  workDuration: number; // in seconds
  technicianSignature: string | null;
  customerSignature: string | null;
  customerName: string | null;
  completedAt: string;
  completedById: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  completedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
  attachments?: ReportAttachment[];
  partsUsed?: PartUsed[];
}

export interface ServiceReportSummary {
  id: string;
  taskId: string;
  taskTitle: string;
  summary: string;
  workDuration: number; // in seconds
  completedAt: string;
  completedBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  partsTotal: number; // Total cost of parts used
  attachmentCount: number;
  hasBeforePhotos: boolean;
  hasAfterPhotos: boolean;
}

export interface CompleteTaskInput {
  summary: string;
  workPerformed?: string;
  workDuration: number;
  technicianSignature?: string;
  customerSignature?: string;
  customerName?: string;
  partsUsed?: {
    name: string;
    partNumber?: string;
    quantity: number;
    unitCost?: number;
    notes?: string;
  }[];
}

export interface UpdateReportInput {
  summary?: string;
  workPerformed?: string;
  technicianSignature?: string;
  customerSignature?: string;
  customerName?: string;
}

// Reports API methods
export const reportsApi = {
  // Get service report for a task
  getTaskReport: async (taskId: string) => {
    const response = await api.get<{ success: boolean; data: ServiceReport }>(
      `/tasks/${taskId}/report`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Get all service reports for an asset (maintenance history)
  getAssetReports: async (assetId: string, params?: { page?: number; limit?: number }) => {
    const endpoint = buildUrlWithQuery(`/assets/${assetId}/reports`, params ?? {});

    const response = await api.get<{
      success: boolean;
      data: ServiceReportSummary[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // Complete a task with service report (TECHNICIAN only)
  completeTask: async (taskId: string, input: CompleteTaskInput) => {
    const response = await api.post<{ success: boolean; data: ServiceReport }>(
      `/tasks/${taskId}/complete`,
      input
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Update a service report (TECHNICIAN only, within 24 hours)
  updateReport: async (reportId: string, input: UpdateReportInput) => {
    const response = await api.patch<{ success: boolean; data: ServiceReport }>(
      `/reports/${reportId}`,
      input
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Add a part to a report
  addPart: async (
    reportId: string,
    part: { name: string; partNumber?: string; quantity: number; unitCost?: number; notes?: string }
  ) => {
    const response = await api.post<{ success: boolean; data: PartUsed }>(
      `/reports/${reportId}/parts`,
      part
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Delete a part from a report
  deletePart: async (reportId: string, partId: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(
      `/reports/${reportId}/parts/${partId}`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },
};

// Report Attachments API (presigned URL upload flow)
export const reportAttachmentsApi = {
  // Get presigned URL for uploading
  getPresignedUrl: async (reportId: string, fileName: string, fileType: string) => {
    const response = await api.post<{
      success: boolean;
      data: { uploadUrl: string; fileUrl: string };
    }>(`/reports/${reportId}/attachments/presign`, { fileName, fileType });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Confirm upload after S3 upload completes
  confirmUpload: async (
    reportId: string,
    data: {
      type: 'BEFORE' | 'AFTER';
      fileName: string;
      fileUrl: string;
      fileSize: number;
      caption?: string;
    }
  ) => {
    const response = await api.post<{ success: boolean; data: ReportAttachment }>(
      `/reports/${reportId}/attachments`,
      data
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Delete an attachment
  delete: async (reportId: string, attachmentId: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(
      `/reports/${reportId}/attachments/${attachmentId}`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },
};

// ============================================
// ATTENDANCE TYPES & API
// ============================================
// Core attendance types imported from @hbcfield/shared (see imports at top)

// Re-export isBreakActive from shared
export { isBreakActive } from '@hbcfield/shared/client';

// Web-specific BreakSummary (different structure from shared)
export interface BreakSummary {
  totalBreaks: number;
  totalBreakMinutes: number;
  averageBreakMinutes: number;
  breaksByType: {
    LUNCH: { count: number; totalMinutes: number; averageMinutes: number };
    SHORT: { count: number; totalMinutes: number; averageMinutes: number };
    OTHER: { count: number; totalMinutes: number; averageMinutes: number };
  };
}

export interface AttendanceSummary {
  period: {
    startDate: string;
    endDate: string;
    workDays: number;
  };
  summary: {
    totalHours: number;
    totalShifts: number;
    activeShifts: number;
    autoClockOuts: number;
    standardHours: number;
    overtimeHours: number;
    averageShiftHours: number;
  };
  byUser: Array<{
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
    totalHours: number;
    shifts: number;
    autoClockOuts: number;
    locations: string[];
    averageShiftHours: number;
  }>;
  byLocation: Array<{
    location: {
      id: string;
      name: string;
    };
    totalHours: number;
    shifts: number;
    uniqueTechnicians: number;
  }>;
}

export interface AttendanceQueryParams {
  locationId?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  status?: TimeEntryStatus;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface AttendanceListResponse {
  success: boolean;
  data: TimeEntry[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// One row in a time entry's edit history (per-edit audit record).
export interface EntryEditChange {
  field: string; // "clockInAt" | "clockOutAt" | "notes" | "timezone"
  from: string | null;
  to: string | null;
}
export interface EntryEditHistoryItem {
  id: string;
  editedAt: string;
  editor: string | null;
  reason: string | null;
  changes: EntryEditChange[];
}

// Attendance API methods (ADMIN/DISPATCHER only)
export interface NoShowRow {
  id: string;
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  spaceId: string;
  spaceName: string;
  expectedClockInAt: string;
  expectedClockOutAt: string;
  state: "REMINDED" | "ESCALATED" | "EXCUSED";
  reminderCount: number;
  localDate: string;
  excuseReason?: string | null;
}

export const attendanceApi = {
  // Employee self-service: my current clock status
  getMyStatus: async () => {
    const response = await api.get<{ success: boolean; data: unknown }>(`/attendance/status`);
    if (response.error) throw new Error(response.error);
    return (response.data as { data?: unknown })?.data ?? response.data;
  },

  // Employee self-service: clock in at a company location. GPS comes from the
  // browser Geolocation API (device location, NOT IP) so it works over a VPN.
  clockIn: async (input: { locationId?: string; lat: number; lng: number; accuracy?: number; isRemote?: boolean }) => {
    const response = await api.post<{ success: boolean; data: unknown }>(`/attendance/clock-in`, input);
    if (response.error) throw new Error(response.error);
    return (response.data as { data?: unknown })?.data ?? response.data;
  },

  // Employee self-service: clock out of the current shift.
  clockOut: async (input: { lat: number; lng: number; accuracy?: number; notes?: string }) => {
    const response = await api.post<{ success: boolean; data: unknown }>(`/attendance/clock-out`, input);
    if (response.error) throw new Error(response.error);
    return (response.data as { data?: unknown })?.data ?? response.data;
  },

  // Employee self-service: my own time-entry history (paginated envelope)
  getMyHistory: async (params?: { page?: number; limit?: number }) => {
    const endpoint = buildUrlWithQuery('/attendance/history', params ?? {});
    const response = await api.get<{ data: TimeEntry[]; meta?: unknown }>(endpoint);
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  // Get time entries for a specific location
  // Batched: today's entries for many spaces in one request (member-scoped).
  getEntriesBatch: async (locationIds: string[], date?: string) => {
    if (locationIds.length === 0) return [] as TimeEntry[];
    const endpoint = buildUrlWithQuery('/attendance/entries', { ids: locationIds.join(','), date });
    const response = await api.get<{ success: boolean; data: TimeEntry[] }>(endpoint);
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  getLocationEntries: async (locationId: string, params?: AttendanceQueryParams) => {
    const endpoint = buildUrlWithQuery(`/attendance/locations/${locationId}/entries`, {
      date: params?.date,
      startDate: params?.startDate,
      endDate: params?.endDate,
      search: params?.search,
      page: params?.page,
      limit: params?.limit,
      sortBy: params?.sortBy,
      sortOrder: params?.sortOrder,
    });

    const response = await api.get<AttendanceListResponse>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // Get all locations for the organization
  getLocations: async () => {
    const response = await api.get<{ success: boolean; data: CompanyLocation[] }>('/locations');

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data || [];
  },

  // Admin: add/back-date attendance for an employee (single day or a
  // weekday-filtered date-range backfill). Server builds one CLOCKED_OUT,
  // pre-approved TimeEntry per matching day (skips days that already have one).
  addManualEntries: async (input: {
    userId: string;
    locationId: string;
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD (== startDate for a single day)
    weekdays?: number[]; // 0=Sun..6=Sat, only for a date range
    startTime: string; // HH:MM
    endTime: string; // HH:MM
    breakMinutes?: number;
    notes?: string;
    reason?: string;
  }) => {
    const response = await api.post<{
      success: boolean;
      data: { created: number; skipped: number };
      message?: string;
    }>('/attendance/entries/manual', input);

    if (response.error) {
      throw new Error(response.error);
    }

    const body = response.data as {
      data?: { created: number; skipped: number };
      message?: string;
    };
    return {
      ...(body?.data ?? { created: 0, skipped: 0 }),
      message: body?.message,
    };
  },

  /**
   * The breaks recorded on one shift, member-taken and manually added alike.
   *
   * The endpoint answers `{ data: { breaks, totalBreakMinutes, breakCount } }` —
   * an OBJECT under `data`, not an array. Reading it as an array and defaulting
   * to `[]` made the dialog report a shift with breaks as a shift with none, and
   * silently: a defensive fallback that hides a shape mismatch is worse than the
   * crash it prevents, because nothing ever says the guess was wrong.
   */
  entryBreaks: async (entryId: string) => {
    const response = await api.get<{ success: boolean; data: { breaks?: EntryBreak[] } }>(
      `/attendance/entries/${entryId}/breaks`,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data?.breaks ?? [];
  },

  /**
   * Remove a break from a shift.
   *
   * Also how an edit is performed — remove and re-add — rather than a second
   * endpoint repeating the same window and overlap validation.
   */
  removeBreak: async (breakId: string) => {
    const response = await api.delete<{ success: boolean }>(`/attendance/breaks/${breakId}`);
    if (response.error) throw new Error(response.error);
  },

  /**
   * Add a break to a member's shift.
   *
   * Breaks are self-service — this is the correction path for a shift where that
   * did not happen. The row records who added it and why, so it is never mistaken
   * for the member's own account of their day. Requires canReconcileAttendance.
   */
  addBreak: async (
    entryId: string,
    input: { type?: string; startedAt: string; endedAt: string; reason: string },
  ) => {
    const response = await api.post<{ success: boolean; data: unknown }>(
      `/attendance/entries/${entryId}/breaks`,
      input,
    );
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  // Admin: correct a time entry (clock-in/out and/or notes). A reason is
  // required and the original values are preserved for audit server-side.
  editEntry: async (
    entryId: string,
    input: { clockInAt?: string; clockOutAt?: string; notes?: string; timezone?: string; reason: string }
  ) => {
    const response = await api.put<{ success: boolean; data: unknown }>(
      `/attendance/entries/${entryId}/edit`,
      input
    );
    if (response.error) {
      throw new Error(response.error);
    }
    return (response.data as { data?: unknown })?.data ?? response.data;
  },

  // Delete a time entry (admin)
  deleteEntry: async (entryId: string) => {
    const response = await api.delete<{ success: boolean }>(`/attendance/entries/${entryId}`);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  // Full edit history (per-edit audit rows) for a time entry.
  getEntryHistory: async (entryId: string) => {
    const response = await api.get<{ success: boolean; data: EntryEditHistoryItem[] }>(
      `/attendance/entries/${entryId}/history`,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data ?? []
  },

  // Get all time entries for the organization (admin view)
  getAllEntries: async (params?: AttendanceQueryParams) => {
    const endpoint = buildUrlWithQuery('/attendance/all-entries', params ?? {});

    const response = await api.get<AttendanceListResponse>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  /** Who is clocked in RIGHT NOW, org-wide — date-independent (catches overnight
   *  shifts). Backs the dashboard "on duty" presence. */
  getActiveEntries: async () => {
    const response = await api.get<{ success: boolean; data: TimeEntry[] }>('/attendance/active-entries');
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  // No-shows: scheduled shifts with no clock-in (reminded/escalated/excused).
  listNoShows: async (params?: { days?: number; spaceId?: string }) => {
    const endpoint = buildUrlWithQuery('/attendance/no-shows', { days: params?.days, spaceId: params?.spaceId });
    const response = await api.get<{ success: boolean; data: NoShowRow[] }>(endpoint);
    if (response.error) throw new Error(response.error);
    return response.data?.data ?? [];
  },

  resolveNoShow: async (id: string, action: "excuse" | "reopen", reason?: string) => {
    const response = await api.patch(`/attendance/no-shows/${id}`, { action, reason });
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  // =========================================================================
  // REPORTS
  // =========================================================================

  // Get attendance summary for a date range
  getSummary: async (params: { startDate: string; endDate: string; userId?: string }) => {
    const endpoint = buildUrlWithQuery('/attendance/reports/summary', params);

    const response = await api.get<{
      success: boolean;
      data: AttendanceSummary;
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Get weekly report
  getWeeklyReport: async (params?: { weekStartDate?: string; userId?: string }) => {
    const endpoint = buildUrlWithQuery('/attendance/reports/weekly', params ?? {});

    const response = await api.get<{
      success: boolean;
      data: AttendanceSummary;
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Get monthly report
  getMonthlyReport: async (params?: { year?: number; month?: number; userId?: string }) => {
    const endpoint = buildUrlWithQuery('/attendance/reports/monthly', params ?? {});

    const response = await api.get<{
      success: boolean;
      data: AttendanceSummary;
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Export attendance to CSV
  exportToCSV: async (params: { startDate: string; endDate: string; userId?: string }) => {
    const endpoint = buildUrlWithQuery('/attendance/reports/export', params);

    const response = await api.get<{
      success: boolean;
      data: {
        filename: string;
        content: string;
        mimeType: string;
        recordCount: number;
      };
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // =========================================================================
  // APPROVALS
  // =========================================================================

  // Get pending approvals
  getPendingApprovals: async (params?: { page?: number; limit?: number }) => {
    const endpoint = buildUrlWithQuery('/attendance/approvals/pending', params ?? {});

    const response = await api.get<AttendanceListResponse>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // Approve a time entry
  approveEntry: async (entryId: string, notes?: string) => {
    const response = await api.post<{
      success: boolean;
      data: TimeEntry;
      message: string;
    }>(`/attendance/approvals/${entryId}/approve`, { notes });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // Reject a time entry
  rejectEntry: async (entryId: string, reason: string) => {
    const response = await api.post<{
      success: boolean;
      data: TimeEntry;
      message: string;
    }>(`/attendance/approvals/${entryId}/reject`, { reason });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // ── Geofence excursions ("out of ring") ──
  // List active (PENDING/APPROVED) out-of-ring requests for the approver surface.
  listExcursions: async (status?: "active" | "pending" | "approved") => {
    const endpoint = buildUrlWithQuery("/attendance/excursions", status ? { status } : {});
    const response = await api.get<{ success: boolean; data: GeofenceExcursion[] }>(endpoint);
    if (response.error) throw new Error(response.error);
    return response.data?.data ?? [];
  },

  // Approve an out-of-ring request (optionally adjusting the granted minutes).
  approveExcursion: async (excursionId: string, grantedMinutes?: number) => {
    const response = await api.patch<{ success: boolean; data: GeofenceExcursion }>(
      `/attendance/excursions/${excursionId}/approve`,
      grantedMinutes != null ? { grantedMinutes } : {},
    );
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  // Reject an out-of-ring request → the worker is clocked out.
  rejectExcursion: async (excursionId: string) => {
    const response = await api.patch<{ success: boolean; data: GeofenceExcursion }>(
      `/attendance/excursions/${excursionId}/reject`,
      {},
    );
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  // Employee reports a reason + duration (used by web clock UI if outside the ring).
  reportExcursion: async (reason: string, requestedMinutes: number) => {
    const response = await api.post<{ success: boolean; data: GeofenceExcursion }>(
      `/attendance/excursions/report`,
      { reason, requestedMinutes },
    );
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  // Bulk approve entries
  bulkApprove: async (entryIds: string[], notes?: string) => {
    const response = await api.post<{
      success: boolean;
      data: {
        approved: string[];
        failed: Array<{ id: string; reason: string }>;
      };
      message: string;
    }>('/attendance/approvals/bulk-approve', { entryIds, notes });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // =========================================================================
  // BREAKS
  // =========================================================================

  // Get all active breaks (organization-wide)
  getActiveBreaks: async () => {
    const response = await api.get<{
      success: boolean;
      data: Break[];
    }>('/attendance/breaks/active');

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data || [];
  },

  // Get break history with optional filters
  getBreakHistory: async (params?: {
    date?: string;
    userId?: string;
    type?: BreakType;
    page?: number;
    limit?: number;
  }) => {
    const endpoint = buildUrlWithQuery('/attendance/breaks/history', params ?? {});

    const response = await api.get<{
      success: boolean;
      data: Break[];
      meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // Get break summary for a date range
  getBreakSummary: async (params: { startDate: string; endDate: string; userId?: string }) => {
    const endpoint = buildUrlWithQuery('/attendance/breaks/summary', params);

    const response = await api.get<{
      success: boolean;
      data: BreakSummary;
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // End a break manually (ADMIN only)
  endBreakManually: async (breakId: string, notes?: string) => {
    const response = await api.post<{
      success: boolean;
      data: Break;
      message: string;
    }>(`/attendance/breaks/${breakId}/end`, { notes });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },
};

// ============================================================================
// EMPLOYEES API
// ============================================================================

export const employeesApi = {
  // List employees with filtering and pagination
  list: async (params?: EmployeesQueryParams) => {
    const endpoint = buildUrlWithQuery('/employees', {
      status: params?.status,
      specialty: params?.specialty,
      search: params?.search,
      page: params?.page,
      limit: params?.limit,
      sortBy: params?.sortBy,
      sortOrder: params?.sortOrder,
    });

    const response = await api.get<{
      success: boolean;
      data: EmployeeListItem[];
      meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // Get employee detail with stats
  getById: async (id: string) => {
    const response = await api.get<{
      success: boolean;
      data: EmployeeProfile & { stats: EmployeeStats };
    }>(`/employees/${id}`);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Create new employee
  create: async (input: CreateEmployeeInput) => {
    const response = await api.post<{
      success: boolean;
      data: EmployeeProfile;
      generatedPassword?: string;
    }>('/employees', input);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // Update employee
  update: async (id: string, input: UpdateEmployeeInput) => {
    const response = await api.patch<{
      success: boolean;
      data: EmployeeProfile;
    }>(`/employees/${id}`, input);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Deactivate employee (soft delete)
  deactivate: async (id: string) => {
    const response = await api.delete<{
      success: boolean;
      message: string;
    }>(`/employees/${id}`);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // Get performance metrics
  getPerformance: async (id: string, startDate?: string, endDate?: string) => {
    const endpoint = buildUrlWithQuery(`/employees/${id}/performance`, {
      startDate,
      endDate,
    });

    const response = await api.get<{
      success: boolean;
      data: PerformanceMetrics;
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Get task history
  getTasks: async (id: string, params?: { status?: string; page?: number; limit?: number }) => {
    const endpoint = buildUrlWithQuery(`/employees/${id}/tasks`, params || {});

    const response = await api.get<{
      success: boolean;
      data: Task[];
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data || [];
  },

  // Get attendance history
  getAttendance: async (id: string, startDate?: string, endDate?: string) => {
    const endpoint = buildUrlWithQuery(`/employees/${id}/attendance`, {
      startDate,
      endDate,
    });

    const response = await api.get<{
      success: boolean;
      data: TimeEntry[];
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data || [];
  },

  // Get location assignments
  getAssignments: async (id: string) => {
    const response = await api.get<{
      success: boolean;
      data: {
        id: string;
        locationId: string;
        isPrimary: boolean;
        schedule: string[];
        effectiveFrom: string;
        effectiveTo?: string;
        location: CompanyLocation;
      }[];
    }>(`/employees/${id}/assignments`);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data || [];
  },

  // ========================================================================
  // SCHEDULE MANAGEMENT
  // ========================================================================

  // Get employee weekly schedule
  getSchedule: async (id: string) => {
    const response = await api.get<{
      success: boolean;
      data: {
        technician: { id: string; firstName: string; lastName: string };
        schedule: ScheduleEntry[];
      };
    }>(`/employees/${id}/schedule`);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Set employee weekly schedule
  setSchedule: async (id: string, schedule: ScheduleEntryInput[]) => {
    const response = await api.post<{
      success: boolean;
      data: ScheduleEntry[];
    }>(`/employees/${id}/schedule`, { schedule });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // ========================================================================
  // TIME-OFF MANAGEMENT
  // ========================================================================

  // Get all time-off requests for the organization
  getOrgTimeOff: async (status?: TimeOffStatus) => {
    const endpoint = buildUrlWithQuery('/employees/time-off', { status });

    const response = await api.get<{
      success: boolean;
      data: (TimeOffRequest & {
        technician: { id: string; firstName: string; lastName: string; email: string; specialty: string | null };
      })[];
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data || [];
  },

  // Get employee time-off requests
  getTimeOff: async (id: string, status?: TimeOffStatus) => {
    const endpoint = buildUrlWithQuery(`/employees/${id}/time-off`, { status });

    const response = await api.get<{
      success: boolean;
      data: TimeOffRequest[];
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data || [];
  },

  /** This year's vacation allowance: total, taken, pending, remaining. */
  getLeaveBalance: async (id: string) => {
    const response = await api.get<{ success: boolean; data: LeaveBalance }>(
      // `/employees`, like every other call in this group — the controller's
      // prefix is 'employees'. `/technicians` 404s, and the page showed a
      // silent zero rather than an error.
      `/employees/${id}/leave-balance`,
    );
    return response.data?.data ?? null;
  },

  // Request time off
  requestTimeOff: async (id: string, data: { startDate: string; endDate: string; reason?: string; type?: string }) => {
    const response = await api.post<{
      success: boolean;
      data: TimeOffRequest;
    }>(`/employees/${id}/time-off`, data);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Admin: add an already-approved day off for an employee (any date, no
  // separate approval step).
  addTimeOff: async (data: {
    technicianId: string;
    startDate: string;
    endDate: string;
    reason?: string;
  }) => {
    const response = await api.post<{
      success: boolean;
      data: TimeOffRequest;
    }>('/employees/time-off/manual', data);

    // `apiError` rather than `new Error`: this endpoint's overlap refusal carries
    // a code and the conflicting dates, so the dialog can say it in the reader's
    // language instead of showing the server's English.
    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Approve or reject time-off request
  approveTimeOff: async (timeOffId: string, approved: boolean, rejectionReason?: string) => {
    const response = await api.patch<{
      success: boolean;
      data: TimeOffRequest;
    }>(`/employees/time-off/${timeOffId}/approve`, { approved, rejectionReason });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Cancel time-off request
  cancelTimeOff: async (timeOffId: string) => {
    const response = await api.delete<{
      success: boolean;
      data: TimeOffRequest;
    }>(`/employees/time-off/${timeOffId}`);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Admin: edit an existing day off (dates / reason)
  updateTimeOff: async (
    timeOffId: string,
    input: { startDate?: string; endDate?: string; reason?: string | null },
  ) => {
    const response = await api.patch<{ success: boolean; data: TimeOffRequest }>(
      `/employees/time-off/${timeOffId}`,
      input,
    );
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data?.data;
  },

  // Admin: delete a day off
  adminDeleteTimeOff: async (timeOffId: string) => {
    const response = await api.delete<{ success: boolean }>(
      `/employees/time-off/${timeOffId}/manage`,
    );
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  // Bulk approve/reject time-off requests
  bulkApproveTimeOff: async (timeOffIds: string[], approved: boolean, rejectionReason?: string) => {
    const response = await api.post<{
      success: boolean;
      data: { succeeded: number; failed: number; total: number };
    }>('/employees/time-off/bulk-approve', { timeOffIds, approved, rejectionReason });
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  // ========================================================================
  // SCHEDULE TEMPLATES
  // ========================================================================

  getScheduleTemplates: async () => {
    const response = await api.get<{ success: boolean; data: ScheduleTemplate[] }>('/employees/schedule-templates');
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  createScheduleTemplate: async (data: { name: string; description?: string; entries: ScheduleTemplateEntry[] }) => {
    const response = await api.post<{ success: boolean; data: ScheduleTemplate }>('/employees/schedule-templates', data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  deleteScheduleTemplate: async (id: string) => {
    const response = await api.delete<{ success: boolean }>(`/employees/schedule-templates/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  applyScheduleTemplate: async (employeeId: string, templateId: string) => {
    // Returns the schedule the template produced — the same rows setSchedule does.
    const response = await api.post<{ success: boolean; data: ScheduleEntry[] }>(
      `/employees/${employeeId}/schedule/apply-template`,
      { templateId },
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  // ========================================================================
  // AVAILABILITY
  // ========================================================================

  // Get all employees availability for a date
  getAvailability: async (date?: string) => {
    const endpoint = buildUrlWithQuery('/employees/availability', { date });

    const response = await api.get<{
      success: boolean;
      data: AvailabilityResponse;
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },

  // Get availability for a date range (single API call)
  getAvailabilityRange: async (startDate: string, endDate: string) => {
    const endpoint = buildUrlWithQuery('/employees/availability', { startDate, endDate });

    const response = await api.get<{
      success: boolean;
      data: AvailabilityResponse[];
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data || [];
  },
};

/** @deprecated Use employeesApi */
export const techniciansApi = employeesApi;

// ========================================================================
// TYPES FOR AVAILABILITY
// ========================================================================

export interface ScheduleEntry {
  id: string;
  technicianId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleEntryInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive?: boolean;
  notes?: string;
}

export type TimeOffStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';

export interface TimeOffRequest {
  id: string;
  technicianId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: TimeOffStatus;
  approvedById?: string;
  approvedBy?: { id: string; firstName: string; lastName: string };
  approvedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeAvailability {
  id: string;
  firstName: string;
  lastName: string;
  isAvailable: boolean;
  onTimeOff: boolean;
  space?: { id: string; name: string } | null;
  schedule: {
    startTime: string;
    endTime: string;
    notes?: string;
  } | null;
  timeOff: {
    startDate: string;
    endDate: string;
    reason?: string;
  } | null;
}

export interface AvailabilityResponse {
  date: string;
  dayOfWeek: number;
  dayName: string;
  technicians: EmployeeAvailability[];
  summary: {
    total: number;
    available: number;
    onTimeOff: number;
    notScheduled: number;
  };
}

// ============================================================================
// INVITATIONS API
// ============================================================================

export const invitationsApi = {
  // Create a new invitation (ADMIN/DISPATCHER)
  // API returns { success, data: { code, ...invitation } } — the plaintext code
  // is only present here, at creation time. Unwrap so callers get `code` flat.
  create: async (input: CreateInvitationInput) => {
    const response = await api.post<{
      success: boolean;
      data: { code: string } & Invitation;
    }>('/invitations', input);

    if (response.error) {
      throw new Error(response.error);
    }

    const payload = response.data?.data;
    return { code: payload?.code as string, invitation: payload as unknown as Invitation };
  },

  // List organization invitations (ADMIN/DISPATCHER)
  list: async (params?: { status?: string; page?: number; limit?: number }) => {
    const endpoint = buildUrlWithQuery('/invitations', {
      status: params?.status,
      page: params?.page,
      limit: params?.limit,
    });

    const response = await api.get<{
      success: boolean;
      data: Invitation[];
      meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // Validate an invitation code (Public)
  validate: async (code: string) => {
    const response = await api.get<InvitationValidation>(
      `/invitations/validate/${code}`,
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // Revoke an invitation (ADMIN/DISPATCHER)
  revoke: async (id: string) => {
    const response = await api.delete<{
      success: boolean;
      message: string;
    }>(`/invitations/${id}`);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },
};

// ============================================================================
// ONBOARDING API — post-registration flow for orphan users (no org yet).
// Mirrors the mobile onboarding flow: create org / join by code / accept invite.
// All endpoints require auth but SKIP the onboarding guard (SkipOnboardingCheck).
// ============================================================================

/** Unwrap the gateway `{ success, data }` envelope, tolerating raw responses. */
function unwrap<T>(body: unknown): T {
  const b = body as { data?: T } | T;
  return ((b as { data?: T })?.data ?? b) as T;
}

/**
 * Runtime shape of `/onboarding/status`. The API flattens the pending request
 * (organizationName, status, rejectionReason) rather than returning the full
 * JoinRequest relation, so this differs from the shared OnboardingStatus type.
 */
export interface OnboardingStatusResult {
  needsOnboarding: boolean;
  hasPendingJoinRequest: boolean;
  pendingRequest: {
    id: string;
    organizationName: string;
    message?: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
    rejectionReason?: string | null;
  } | null;
}

export const onboardingApi = {
  getStatus: async (): Promise<OnboardingStatusResult> => {
    const response = await api.get<unknown>('/onboarding/status');
    if (response.error) throw new Error(response.error);
    return unwrap<OnboardingStatusResult>(response.data);
  },

  createOrganization: async (data: {
    name: string;
    address?: string;
    industry?: string;
    firstSpaceName?: string;
  }): Promise<{ organization: { id: string; name: string }; joinCode?: string }> => {
    const response = await api.post<unknown>('/onboarding/create-org', data);
    if (response.error) throw new Error(response.error);
    return unwrap(response.data);
  },

  validateOrgCode: async (code: string): Promise<OrgCodeValidation> => {
    const response = await api.get<unknown>(
      `/onboarding/validate-org-code/${encodeURIComponent(code)}`,
    );
    if (response.error) throw new Error(response.error);
    return unwrap<OrgCodeValidation>(response.data);
  },

  submitJoinRequest: async (data: {
    orgCode: string;
    message?: string;
  }): Promise<{ autoApproved?: boolean; joinRequest?: { id: string } }> => {
    const response = await api.post<unknown>('/onboarding/join-by-code', data);
    if (response.error) throw new Error(response.error);
    return unwrap(response.data);
  },

  acceptInvitation: async (code: string): Promise<unknown> => {
    const response = await api.post<unknown>('/onboarding/accept-invitation', { code });
    if (response.error) throw new Error(response.error);
    return unwrap(response.data);
  },

  cancelJoinRequest: async (id: string): Promise<unknown> => {
    const response = await api.delete<unknown>(`/onboarding/join-requests/${encodeURIComponent(id)}`);
    if (response.error) throw new Error(response.error);
    return unwrap(response.data);
  },
};

// ============================================================================
// JOIN REQUESTS API
// ============================================================================

export const joinRequestsApi = {
  list: async (params?: { status?: string; page?: number; limit?: number }) => {
    const endpoint = buildUrlWithQuery('/join-requests', {
      status: params?.status,
      page: params?.page,
      limit: params?.limit,
    });
    const response = await api.get<{
      success: boolean;
      data: JoinRequest[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(endpoint);
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  approve: async (id: string, data: {
    role: string;
    workMode?: string;
    specialty?: string;
    maxDailyJobs?: number;
  }) => {
    const response = await api.patch<{ success: boolean; data: JoinRequest }>(`/join-requests/${id}/approve`, data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  reject: async (id: string, data?: { reason?: string }) => {
    const response = await api.patch<{ success: boolean; data: JoinRequest }>(`/join-requests/${id}/reject`, data || {});
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },
};

// ============================================================================
// ORGANIZATIONS API
// ============================================================================

// Organization member type
export interface OrgMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  /** Owns the organization. Cannot be removed or demoted until ownership moves. */
  isOwner?: boolean;
  avatarUrl?: string | null;
  createdAt: string;
  // Mobile Access Profile (JSON, e.g. { modules: ["tasks","clock"] }). Used to
  // tell whether a member can actually receive/see tasks.
  enabledModules?: unknown;
  workMode?: string;
  specialty?: string;
  presence?: string | null;
  contactable?: boolean;
  contactScope?: string;
  contactAllowedIds?: string[];
  allowRemote?: boolean;
  lastActiveAt?: string | null;
  position: string | null;
  scheduleType: string | null;
  monthlyHourBudget: number | null;
  canCreateTasks: boolean;
  taskCreationScope?: string;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  canViewReports?: boolean;
  /** 'IN_HOUSE' | 'EXTERNAL' — field seat pricing. */
  employmentType?: string | null;
  maxDailyJobs?: number | null;
  /** Unified org-wide role (AccessRole id) — e.g. Manager. */
  memberRoleId?: string | null;
  memberRole?: { id: string; name: string; color?: string | null } | null;
}

/** An org-assignable role (Admin, Manager, or a custom role). */
/** One break on a shift. `addedBy` is null when the member recorded it themselves. */
export interface EntryBreak {
  id: string;
  type: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  reason?: string | null;
  addedBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface AccessRole {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
  scope: string;
  isSystem: boolean;
  permissions?: Record<string, boolean>;
  /** Active members holding this role. Absent on older servers — treat as 0. */
  memberCount?: number;
}

export interface UpdateMemberInput {
  /** Login email — unique across all users. Only send it when it changed. */
  email?: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  scheduleType?: string;
  monthlyHourBudget?: number;
  role?: string;
  canCreateTasks?: boolean;
  taskCreationScope?: string;
  canViewAllTasks?: boolean;
  canAssignTasks?: boolean;
  canManageUsers?: boolean;
  canViewReports?: boolean;
  /** Org-wide role id (AccessRole), or null to clear. */
  memberRoleId?: string | null;
  /** Per-user Access Profile object, or a legacy module string[]. */
  enabledModules?: Record<string, unknown> | string[];
  contactable?: boolean;
  contactScope?: string;
  contactAllowedIds?: string[];
  allowRemote?: boolean;
}

export interface MemberWatcher {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string | null;
  role: string;
}

export const organizationsApi = {
  getJoinCode: async () => {
    const response = await api.get<{
      success: boolean;
      data: { hasJoinCode: boolean; joinCode: string | null; joinPolicy: string };
    }>('/organizations/join-code');
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  regenerateJoinCode: async () => {
    const response = await api.post<{
      success: boolean;
      data: { joinCode: string };
    }>('/organizations/regenerate-join-code');
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  updateSettings: async (data: { joinPolicy: string }) => {
    const response = await api.patch<{
      success: boolean;
      data: { joinPolicy: string };
    }>('/organizations/settings', data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  /** The organization's annual vacation days (ADMIN only). */
  updateLeavePolicy: async (defaultLeaveAllowance: number) => {
    const response = await api.patch('/organizations/leave-policy', { defaultLeaveAllowance });
    return response.data;
  },

  getRoles: async (scope?: "org" | "space"): Promise<AccessRole[]> => {
    const endpoint = scope === "space" ? "/organizations/roles?scope=space" : "/organizations/roles";
    const response = await api.get<{ success: boolean; data: AccessRole[] }>(endpoint);
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  createRole: async (input: { name: string; description?: string; color?: string; permissions?: Record<string, boolean> }): Promise<AccessRole> => {
    const response = await api.post<{ success: boolean; data: AccessRole }>('/organizations/roles', input);
    if (response.error) throw new Error(response.error);
    return response.data!.data;
  },

  updateRole: async (id: string, input: { name?: string; description?: string; color?: string; permissions?: Record<string, boolean> }): Promise<AccessRole> => {
    const response = await api.patch<{ success: boolean; data: AccessRole }>(`/organizations/roles/${id}`, input);
    if (response.error) throw new Error(response.error);
    return response.data!.data;
  },

  /**
   * Hand the organization to another member.
   *
   * Owner-only, enforced by the server: no permission grants this, because an
   * admin who could take ownership could then remove the founder.
   */
  transferOwnership: async (newOwnerId: string): Promise<void> => {
    const response = await api.post<{ success: boolean }>("/organizations/transfer-ownership", { newOwnerId });
    if (response.error) throw new Error(response.error);
  },

  deleteRole: async (id: string): Promise<void> => {
    const response = await api.delete<{ success: boolean }>(`/organizations/roles/${id}`);
    if (response.error) throw new Error(response.error);
  },

  getMembers: async (params?: {
    search?: string; role?: string; page?: number; limit?: number;
    /** Only admins and managers (by role), filtered in the query. */
    managersOnly?: boolean;
    /** Ids to keep even if they no longer qualify (already-granted picks). */
    includeIds?: string[];
    /** Member to leave out — the person the picker is about. */
    excludeId?: string;
    /** Identity + presence only. For lists that show people, not permissions. */
    lite?: boolean;
  }) => {
    const endpoint = buildUrlWithQuery('/organizations/members', {
      search: params?.search,
      role: params?.role !== 'all' ? params?.role : undefined,
      page: params?.page,
      limit: params?.limit,
      managersOnly: params?.managersOnly ? 'true' : undefined,
      includeIds: params?.includeIds?.length ? params.includeIds.join(',') : undefined,
      excludeId: params?.excludeId,
      lite: params?.lite ? 'true' : undefined,
    });
    const response = await api.get<{
      success: boolean;
      data: OrgMember[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(endpoint);
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  // Fetch a SINGLE member by id (same shape as a list row) — for the member
  // detail page, so it doesn't pull the whole org and find() one (P1).
  getMember: async (memberId: string) => {
    const response = await api.get<{ success: boolean; data: OrgMember }>(
      `/organizations/members/${memberId}`,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data ?? null;
  },

  // Contacts directory — any org member can reach the org's admins/managers.
  getContacts: async () => {
    const response = await api.get<{ success: boolean; data: OrgMember[] }>('/organizations/contacts');
    if (response.error) throw new Error(response.error);
    return response.data?.data ?? [];
  },

  updateMember: async (memberId: string, data: UpdateMemberInput) => {
    const response = await api.patch<{
      success: boolean;
      data: OrgMember;
    }>(`/organizations/members/${memberId}`, data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  resetMemberPassword: async (memberId: string) => {
    const response = await api.post<{
      success: boolean;
      temporaryPassword: string;
    }>(`/organizations/members/${memberId}/reset-password`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  removeMember: async (memberId: string) => {
    const response = await api.delete<{
      success: boolean;
      message: string;
    }>(`/organizations/members/${memberId}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  // Notification routing — who gets notified ABOUT this member.
  getMemberWatchers: async (memberId: string) => {
    const response = await api.get<{ data: MemberWatcher[] }>(
      `/organizations/members/${memberId}/watchers`,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },
  setMemberWatchers: async (memberId: string, watcherIds: string[]) => {
    const response = await api.put<{ data: MemberWatcher[] }>(
      `/organizations/members/${memberId}/watchers`,
      { watcherIds },
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  getProfileBadges: async () => {
    const response = await api.get<{
      success: boolean;
      data: { profileBadges: { showRole: boolean; showType: boolean; showSpecialty: boolean } | null };
    }>('/organizations/profile-badges');
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  updateProfileBadges: async (data: { showRole: boolean; showType: boolean; showSpecialty: boolean }) => {
    const response = await api.patch<{
      success: boolean;
      data: { profileBadges: { showRole: boolean; showType: boolean; showSpecialty: boolean } };
    }>('/organizations/profile-badges', data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  getProfile: async () => {
    const response = await api.get<{ success: boolean; data: OrganizationProfile }>('/organizations/profile');
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  updateProfile: async (updates: Partial<OrganizationProfile>) => {
    const response = await api.patch<{ success: boolean; data: OrganizationProfile }>('/organizations/profile', updates);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  updateNotificationPrefs: async (prefs: Record<string, boolean>) => {
    const response = await api.patch<{ success: boolean; data: OrganizationProfile }>('/organizations/notification-prefs', prefs);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  updateSecuritySettings: async (settings: Record<string, boolean | number>) => {
    const response = await api.patch<{ success: boolean; data: OrganizationProfile }>('/organizations/security-settings', settings);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  updateEnabledModules: async (enabledModules: string[]) => {
    const response = await api.patch<{ success: boolean; data: OrganizationProfile }>('/organizations/profile', { enabledModules });
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  getAuditLogs: async (params?: {
    eventType?: string;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => {
    const endpoint = buildUrlWithQuery('/organizations/audit-logs', params ?? {});
    const response = await api.get<{
      data: Array<{
        id: string;
        eventType: string;
        userId: string | null;
        user: { id: string; firstName: string; lastName: string; email: string } | null;
        targetUserId: string | null;
        targetUser: { id: string; firstName: string; lastName: string; email: string } | null;
        resourceType: string | null;
        resourceId: string | null;
        metadata: Record<string, unknown> | null;
        ipAddress: string | null;
        createdAt: string;
      }>;
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(endpoint);
    if (response.error) throw new Error(response.error);
    return response.data;
  },
};

// ============================================================================
// LOCATIONS API
// ============================================================================

export interface CreateLocationInput {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  geofenceRadius?: number;
  timezone?: string;
  enabledModules?: string[];
  workflowId?: string;
  // Ownership classification + customer contact fields (CUSTOMER kind).
  kind?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  billableRateCents?: number | null;
}

export interface UpdateLocationInput {
  name?: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  geofenceRadius?: number;
  timezone?: string;
  isActive?: boolean;
  enabledModules?: string[];
  workflowId?: string;
  workModel?: string;
  kind?: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  billableRateCents?: number | null;
  notifyRoleIds?: string[];
  contactRoleIds?: string[];
  approveRoleIds?: string[];
}

export interface LocationAssignment {
  id: string;
  userId: string;
  locationId: string;
  isPrimary: boolean;
  schedule: string[];
  effectiveFrom: string;
  effectiveTo?: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    workMode?: string;
    avatarUrl?: string | null;
  };
  location?: CompanyLocation;
  // Server-computed presence: the member's current active task at this location
  // (so employees, who can't read colleagues' tasks, still see who is working).
  currentTask?: string | null;
  currentTaskStatus?: string | null;
}

export interface AssignMemberInput {
  userId: string;
  isPrimary?: boolean;
  schedule?: string[];
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface UpdateAssignmentInput {
  isPrimary?: boolean;
  schedule?: string[];
  effectiveFrom?: string;
  effectiveTo?: string;
}

export const locationsApi = {
  // NB: no `search` option — GET /locations exposes page/limit/includeInactive/kind
  // only. It used to be in this signature but was never forwarded, so callers
  // passing it got unfiltered results with no error.
  list: async (params?: { page?: number; limit?: number; includeInactive?: boolean; kind?: string }) => {
    const endpoint = buildUrlWithQuery('/locations', {
      page: params?.page,
      limit: params?.limit,
      includeInactive: params?.includeInactive,
      // Default (omitted) hides CUSTOMER spaces from work pickers; pass 'all' for the directory.
      kind: params?.kind,
    });

    const response = await api.get<{
      success: boolean;
      data: CompanyLocation[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(endpoint);

    if (response.error) throw new Error(response.error);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get<{ success: boolean; data: CompanyLocation }>(`/locations/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  create: async (data: CreateLocationInput) => {
    const response = await api.post<{ success: boolean; data: CompanyLocation }>('/locations', data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  update: async (id: string, data: UpdateLocationInput) => {
    const response = await api.patch<{ success: boolean; data: CompanyLocation }>(`/locations/${id}`, data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  delete: async (id: string) => {
    const response = await api.delete<{ success: boolean; data: CompanyLocation }>(`/locations/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  /** Permanent delete — server rejects spaces that still carry history. */
  purge: async (id: string) => {
    const response = await api.delete<{ success: boolean; data: { id: string } }>(`/locations/${id}/permanent`);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  // Member assignments
  getAssignedMembers: async (locationId: string) => {
    const response = await api.get<{ success: boolean; data: LocationAssignment[] }>(`/locations/${locationId}/members`);
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  // Batched: rosters (with current task) for many spaces in one request.
  getRosters: async (locationIds: string[]) => {
    if (locationIds.length === 0) return [] as LocationAssignment[];
    const response = await api.get<{ success: boolean; data: LocationAssignment[] }>(`/locations/rosters?ids=${locationIds.join(',')}`);
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  /** @deprecated Use getAssignedMembers */
  getAssignedTechnicians: async (locationId: string) => {
    const response = await api.get<{ success: boolean; data: LocationAssignment[] }>(`/locations/${locationId}/members`);
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  assignMember: async (locationId: string, data: AssignMemberInput) => {
    const response = await api.post<{ success: boolean; data: LocationAssignment }>(`/locations/${locationId}/members`, data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  updateAssignment: async (locationId: string, assignmentId: string, data: UpdateAssignmentInput) => {
    const response = await api.patch<{ success: boolean; data: LocationAssignment }>(`/locations/${locationId}/members/${assignmentId}`, data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  removeAssignment: async (locationId: string, assignmentId: string) => {
    const response = await api.delete<{ success: boolean }>(`/locations/${locationId}/members/${assignmentId}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  getEffectiveModules: async (spaceId: string) => {
    const response = await api.get<{ success: boolean; data: { enabledModules: string[]; workflowId?: string } }>(`/locations/${spaceId}/modules`);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  // Re-sync existing tasks in a space onto the space's workflow (ADMIN only).
  resyncTasks: async (spaceId: string) => {
    const response = await api.post<{ success: boolean; data: { updated: number; remapped: number; reason?: string } }>(`/tasks/resync/${spaceId}`, {});
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  // Re-sync EVERY space's tasks onto their workflows in one action (ADMIN only).
  resyncAllTasks: async () => {
    const response = await api.post<{ success: boolean; data: { spacesProcessed: number; updated: number; remapped: number } }>(`/tasks/resync-all`, {});
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },
};

// ── Shift scheduling (space-centric attendance) ──────────────────────────────

export interface CreateShiftInput {
  spaceId?: string | null;
  name: string;
  description?: string;
  color?: string;
  startLocal: string;
  endLocal: string;
  breakMinutes?: number;
  graceMin?: number;
  reminderIntervalMin?: number;
  maxReminders?: number;
  flagToleranceMin?: number;
}

export interface CreateRotaInput {
  userId: string;
  shiftId: string;
  recurrence: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ONE_OFF';
  daysOfWeek?: number[];
  daysOfMonth?: number[];
  dates?: string[];
  effectiveFrom?: string;
  effectiveTo?: string | null;
  priority?: number;
}

export const shiftsApi = {
  list: async (spaceId?: string) => {
    const endpoint = buildUrlWithQuery('/shifts', { spaceId });
    const res = await api.get<{ success: boolean; data: Shift[] }>(endpoint);
    if (res.error) throw new Error(res.error);
    return res.data?.data || [];
  },
  create: async (data: CreateShiftInput) => {
    const res = await api.post<{ success: boolean; data: Shift }>('/shifts', data);
    if (res.error) throw new Error(res.error);
    return res.data?.data;
  },
  update: async (id: string, data: Partial<CreateShiftInput> & { isActive?: boolean }) => {
    const res = await api.patch<{ success: boolean; data: Shift }>(`/shifts/${id}`, data);
    if (res.error) throw new Error(res.error);
    return res.data?.data;
  },
  remove: async (id: string) => {
    const res = await api.delete<{ success: boolean }>(`/shifts/${id}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
};

export const rotaApi = {
  list: async (spaceId: string, includeEnded = false) => {
    const endpoint = buildUrlWithQuery(`/spaces/${spaceId}/rota`, { includeEnded: includeEnded || undefined });
    const res = await api.get<{ success: boolean; data: ShiftAssignment[] }>(endpoint);
    if (res.error) throw new Error(res.error);
    return res.data?.data || [];
  },
  create: async (spaceId: string, data: CreateRotaInput) => {
    const res = await api.post<{ success: boolean; data: ShiftAssignment }>(`/spaces/${spaceId}/rota`, data);
    if (res.error) throw new Error(res.error);
    return res.data?.data;
  },
  update: async (assignmentId: string, data: Partial<CreateRotaInput> & { isActive?: boolean }) => {
    const res = await api.patch<{ success: boolean; data: ShiftAssignment }>(`/rota/${assignmentId}`, data);
    if (res.error) throw new Error(res.error);
    return res.data?.data;
  },
  remove: async (assignmentId: string) => {
    const res = await api.delete<{ success: boolean }>(`/rota/${assignmentId}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
};

export const spaceRolesApi = {
  list: async () => {
    const res = await api.get<{ success: boolean; data: SpaceRole[] }>('/space-roles');
    if (res.error) throw new Error(res.error);
    return res.data?.data || [];
  },
  create: async (data: { name: string; description?: string; color?: string; permissions?: Partial<SpaceRolePermissions> }) => {
    const res = await api.post<{ success: boolean; data: SpaceRole }>('/space-roles', data);
    if (res.error) throw new Error(res.error);
    return res.data?.data;
  },
  update: async (
    id: string,
    data: { name?: string; description?: string; color?: string; permissions?: Partial<SpaceRolePermissions>; isActive?: boolean },
  ) => {
    const res = await api.patch<{ success: boolean; data: SpaceRole }>(`/space-roles/${id}`, data);
    if (res.error) throw new Error(res.error);
    return res.data?.data;
  },
  remove: async (id: string) => {
    const res = await api.delete<{ success: boolean }>(`/space-roles/${id}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
};

export const spaceMembersApi = {
  list: async (spaceId: string) => {
    const res = await api.get<{ success: boolean; data: SpaceMember[] }>(`/spaces/${spaceId}/members`);
    if (res.error) throw new Error(res.error);
    return res.data?.data || [];
  },
  assign: async (spaceId: string, data: { userId: string; spaceRoleId?: string | null }) => {
    const res = await api.post<{ success: boolean; data: SpaceMember }>(`/spaces/${spaceId}/members`, data);
    if (res.error) throw new Error(res.error);
    return res.data?.data;
  },
  remove: async (spaceId: string, memberId: string) => {
    const res = await api.delete<{ success: boolean }>(`/spaces/${spaceId}/members/${memberId}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
  updateRouting: async (
    spaceId: string,
    memberId: string,
    data: {
      notifyRoleIds?: string[]
      notifyUserIds?: string[]
      contactRoleIds?: string[]
      contactUserIds?: string[]
      approveRoleIds?: string[]
      approveUserIds?: string[]
    },
  ) => {
    const res = await api.patch<{ success: boolean; data: unknown }>(`/spaces/${spaceId}/members/${memberId}/routing`, data);
    if (res.error) throw new Error(res.error);
    return res.data?.data;
  },
};

export interface Colleague {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  position?: string | null;
  role?: string;
  spaceName?: string | null;
}

export const teamApi = {
  /** Colleagues in the current user's visible spaces. */
  list: async (): Promise<Colleague[]> => {
    const response = await api.get<{ success: boolean; data: Colleague[] }>('/locations/team');
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },
};

// ============================================================================
// OVERTIME API
// ============================================================================

export interface OvertimeRequest {
  id: string;
  technicianId: string;
  timeEntryId: string;
  locationId: string;
  status: string;
  technicianRespondedAt?: string;
  technicianReason?: string;
  approvalMethod?: string;
  approvedById?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  leaderName?: string;
  leaderSignature?: string;
  maxDurationMinutes?: number;
  overtimeStartAt?: string;
  overtimeEndAt?: string;
  actualEndAt?: string;
  overtimeMinutes?: number;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  technician?: { id: string; firstName: string; lastName: string; email?: string };
  location?: { id: string; name: string };
  approvedBy?: { id: string; firstName: string; lastName: string };
}

export const overtimeApi = {
  getPendingApprovals: async () => {
    const response = await api.get<{ success: boolean; data: OvertimeRequest[] }>('/overtime/pending-approvals');
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  approve: async (id: string, data: { maxDurationMinutes: number; notes?: string }) => {
    const response = await api.post<{ success: boolean; data: OvertimeRequest }>(`/overtime/${id}/approve`, data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  reject: async (id: string, data: { reason: string }) => {
    const response = await api.post<{ success: boolean; data: OvertimeRequest }>(`/overtime/${id}/reject`, data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  getHistory: async (params?: { technicianId?: string; status?: string; page?: number; limit?: number }) => {
    const endpoint = buildUrlWithQuery('/overtime/history', {
      technicianId: params?.technicianId,
      status: params?.status,
      page: params?.page,
      limit: params?.limit,
    });
    const response = await api.get<{ success: boolean; data: { data: OvertimeRequest[]; meta: PaginationMeta } }>(endpoint);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },
};

// ============================================================================
// PHASES API
// ============================================================================

export const phasesApi = {
  list: async () => {
    const response = await api.get<{ success: boolean; data: Phase[] }>('/phases');
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  create: async (data: { name: string; description?: string; color?: string; type?: string; startDate?: string; endDate?: string }) => {
    const response = await api.post<{ success: boolean; data: Phase }>('/phases', data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  update: async (id: string, data: Partial<{ name: string; description: string; color: string; type: string; startDate: string; endDate: string; isActive: boolean }>) => {
    const response = await api.patch<{ success: boolean; data: Phase }>(`/phases/${id}`, data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  delete: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(`/phases/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },
};

// ============================================================================
// SPRINTS API
// ============================================================================

export const sprintsApi = {
  list: async (status?: string) => {
    const endpoint = status ? `/sprints?status=${status}` : '/sprints';
    const response = await api.get<{ success: boolean; data: Sprint[] }>(endpoint);
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  getById: async (id: string) => {
    const response = await api.get<{ success: boolean; data: Sprint }>(`/sprints/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  create: async (data: { name: string; goal?: string; startDate: string; endDate: string }) => {
    const response = await api.post<{ success: boolean; data: Sprint }>('/sprints', data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  update: async (id: string, data: Partial<{ name: string; goal: string; startDate: string; endDate: string }>) => {
    const response = await api.patch<{ success: boolean; data: Sprint }>(`/sprints/${id}`, data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  start: async (id: string) => {
    const response = await api.post<{ success: boolean; data: Sprint }>(`/sprints/${id}/start`);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  complete: async (id: string) => {
    const response = await api.post<{ success: boolean; data: Sprint }>(`/sprints/${id}/complete`);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  delete: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(`/sprints/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  getReport: async (id: string): Promise<SprintReport | undefined> => {
    const response = await api.get<{ success: boolean; data: SprintReport }>(`/sprints/${id}/report`);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  getVelocity: async (): Promise<{ sprintName: string; velocity: number }[]> => {
    const response = await api.get<{ success: boolean; data: { sprintName: string; velocity: number }[] }>('/sprints/velocity');
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },
};

// ============================================================================
// STATUS WORKFLOWS TYPES & API
// ============================================================================

export interface StatusWorkflow {
  id: string;
  name: string;
  /**
   * What the TASK carries throughout its life — sprint, story points, epic,
   * phase, subtasks, dependencies, crm. Distinct from a status's capabilities,
   * which say what the member does at one step.
   */
  capabilities?: string[];
  isDefault: boolean;
  isActive: boolean;
  organizationId: string;
  /** Set → this space's own task type. Null → the whole organization's. */
  ownerSpaceId?: string | null;
  ownerSpace?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  statuses?: WorkflowStatus[];
}

export interface WorkflowStatus {
  id: string;
  workflowId: string;
  name: string;
  /**
   * Translation key, present only when the step came from a shipped template.
   * Render with `workflowStatusLabel(status, t)` — never `status.name` directly,
   * or a German organisation reads "On The Way" in an otherwise German app.
   */
  nameKey?: string | null;
  key: string;
  color: string;
  icon: string | null;
  position: number;
  isFinal: boolean;
  isCanceled: boolean;
  transitions: string[];
  capabilities?: string[];
  wipLimit?: number | null;
  createdAt: string;
}

/** A task type in the shared library, as a tenant sees it. */
export interface WorkflowLibraryTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  industry: string | null;
  icon: string | null;
  statuses: WorkflowStatus[];
}

export const workflowsApi = {
  // ── The shared task-type library ────────────────────────────────────────────
  //
  // Read and copy only. The statuses are never sent from here — using a template
  // sends its id, and the server reads the definition itself, so what a new task
  // type looks like is not something the browser decides.

  library: {
    list: async (): Promise<WorkflowLibraryTemplate[]> => {
      const response = await api.get<{ success: boolean; data: WorkflowLibraryTemplate[] }>('/workflows/library');
      if (response.error) throw new Error(response.error);
      return response.data?.data || [];
    },

    /**
     * Copy a template in. With `spaceId` it FORKS into that space — the copy is
     * that space's own, so editing it there affects nobody else. Pass
     * `shareWithOrganization` to take it org-wide instead, so several spaces can
     * offer one definition.
     */
    use: async (
      templateId: string,
      opts?: { name?: string; isDefault?: boolean; spaceId?: string; shareWithOrganization?: boolean },
    ): Promise<StatusWorkflow | undefined> => {
      const response = await api.post<{ success: boolean; data: StatusWorkflow }>(
        `/workflows/library/${templateId}`,
        opts ?? {},
      );
      if (response.error) throw new Error(response.error);
      return response.data?.data;
    },
  },

  // ── Which task types a space offers ─────────────────────────────────────────

  /** This space's task types, default first. */
  listForSpace: async (spaceId: string) => {
    const response = await api.get<{ success: boolean; data: (StatusWorkflow & { isDefault?: boolean })[] }>(
      `/workflows/spaces/${spaceId}`,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  /** Offer a task type here. Refused when the space lacks a module its steps need. */
  attachToSpace: async (spaceId: string, workflowId: string, makeDefault?: boolean) => {
    const response = await api.post(`/workflows/spaces/${spaceId}/${workflowId}`, { makeDefault });
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  detachFromSpace: async (spaceId: string, workflowId: string) => {
    const response = await api.delete(`/workflows/spaces/${spaceId}/${workflowId}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  /** Take this space's own copy of a shared task type, so it can diverge. */
  forkForSpace: async (spaceId: string, workflowId: string) => {
    const response = await api.post<{ success: boolean; data: { workflowId: string; name: string } }>(
      `/workflows/spaces/${spaceId}/${workflowId}/fork`, {},
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  /** Widen a space's own task type so any space in the organization can offer it. */
  shareWithOrganization: async (workflowId: string) => {
    const response = await api.post(`/workflows/${workflowId}/share-with-organization`, {});
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  setSpaceDefault: async (spaceId: string, workflowId: string) => {
    const response = await api.patch(`/workflows/spaces/${spaceId}/${workflowId}/default`, {});
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  list: async () => {
    const response = await api.get<{ success: boolean; data: StatusWorkflow[] }>('/workflows');
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  getById: async (id: string) => {
    const response = await api.get<{ success: boolean; data: StatusWorkflow }>(`/workflows/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  create: async (data: {
    name: string;
    isDefault?: boolean;
    /** Create it as this space's own. Omit for one the organization can share. */
    spaceId?: string;
    /** What the TASK carries throughout: sprint, story_points, subtasks… */
    capabilities?: string[];
    statuses?: Array<{
      name: string;
      key: string;
      color?: string;
      icon?: string;
      position?: number;
      isFinal?: boolean;
      isCanceled?: boolean;
      transitions?: string[];
      capabilities?: string[];
    }>;
  }) => {
    const response = await api.post<{ success: boolean; data: StatusWorkflow }>('/workflows', data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  /**
   * Offer this task type to the shared library. It does NOT publish — a curator
   * reads it before any other organization is offered it.
   */
  submitToLibrary: async (id: string, note?: string) => {
    const response = await api.post<{ success: boolean; data: { id: string; resubmitted: boolean } }>(
      `/workflows/${id}/submit-to-library`,
      { note },
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  update: async (id: string, data: Partial<StatusWorkflow>) => {
    const response = await api.patch<{ success: boolean; data: StatusWorkflow }>(`/workflows/${id}`, data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  delete: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(`/workflows/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  addStatus: async (
    workflowId: string,
    data: {
      name: string;
      key: string;
      color: string;
      position?: number;
      isFinal?: boolean;
      isCanceled?: boolean;
      transitions?: string[];
      capabilities?: string[];
      wipLimit?: number | null;
    },
  ) => {
    const response = await api.post<{ success: boolean; data: WorkflowStatus }>(
      `/workflows/${workflowId}/statuses`,
      data,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  updateStatus: async (workflowId: string, statusId: string, data: Partial<WorkflowStatus>) => {
    const response = await api.patch<{ success: boolean; data: WorkflowStatus }>(
      `/workflows/${workflowId}/statuses/${statusId}`,
      data,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  deleteStatus: async (workflowId: string, statusId: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(
      `/workflows/${workflowId}/statuses/${statusId}`,
    );
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  reorderStatuses: async (workflowId: string, statusIds: string[]) => {
    const response = await api.post<{ success: boolean; data: StatusWorkflow }>(
      `/workflows/${workflowId}/statuses/reorder`,
      { statusIds },
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  setDefault: async (id: string) => {
    const response = await api.post<{ success: boolean; data: StatusWorkflow }>(
      `/workflows/${id}/set-default`,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },
};

// ============================================================================
// CUSTOM FIELDS TYPES & API
// ============================================================================

export type CustomFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'DROPDOWN' | 'CHECKBOX' | 'URL' | 'EMAIL';

export interface CustomFieldDefinition {
  id: string;
  organizationId: string;
  /** Task Type this field belongs to; null = global (all tasks). */
  workflowId: string | null;
  name: string;
  key: string;
  type: CustomFieldType;
  options: string[] | null;
  isRequired: boolean;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomFieldValue {
  id: string;
  definitionId: string;
  taskId: string;
  value: string;
  definition?: CustomFieldDefinition;
}

export const customFieldsApi = {
  // No param → ALL definitions (editor). forWorkflow=<id> → that Task Type's
  // fields + globals. forWorkflow='__none__' → globals only.
  listDefinitions: async (params?: { forWorkflow?: string }) => {
    const qs = params?.forWorkflow ? `?forWorkflow=${encodeURIComponent(params.forWorkflow)}` : '';
    const response = await api.get<{ success: boolean; data: CustomFieldDefinition[] }>(`/custom-fields${qs}`);
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  createDefinition: async (data: {
    name: string;
    key: string;
    type: string;
    options?: string[];
    isRequired?: boolean;
    workflowId?: string | null;
  }) => {
    const response = await api.post<{ success: boolean; data: CustomFieldDefinition }>('/custom-fields', data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  updateDefinition: async (id: string, data: Partial<CustomFieldDefinition>) => {
    const response = await api.patch<{ success: boolean; data: CustomFieldDefinition }>(
      `/custom-fields/${id}`,
      data,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  deleteDefinition: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(`/custom-fields/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  getTaskValues: async (taskId: string) => {
    const response = await api.get<{ success: boolean; data: CustomFieldValue[] }>(
      `/tasks/${taskId}/custom-fields`,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  setTaskValues: async (taskId: string, values: { definitionId: string; value: string }[]) => {
    const response = await api.patch<{ success: boolean; data: CustomFieldValue[] }>(
      `/tasks/${taskId}/custom-fields`,
      { values },
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },
};

// ============================================================================
// RECURRING TASKS TYPES & API
// ============================================================================

export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';

export interface RecurringTaskTemplate {
  id: string;
  organizationId: string;
  spaceId: string | null;
  workflowId: string | null;
  space?: { id: string; name: string } | null;
  workflow?: { id: string; name: string } | null;
  title: string;
  description: string | null;
  priority: string;
  locationAddress: string | null;
  assigneeIds: string[] | null;
  estimatedHours: number | null;
  checklist: { text: string }[] | null;
  frequency: RecurringFrequency;
  customDays: number | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  lastGeneratedAt: string | null;
  nextRunAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const recurringTasksApi = {
  list: async () => {
    const response = await api.get<{ success: boolean; data: RecurringTaskTemplate[] }>('/recurring-tasks');
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  create: async (data: Partial<RecurringTaskTemplate>) => {
    const response = await api.post<{ success: boolean; data: RecurringTaskTemplate }>(
      '/recurring-tasks',
      data,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  update: async (id: string, data: Partial<RecurringTaskTemplate>) => {
    const response = await api.patch<{ success: boolean; data: RecurringTaskTemplate }>(
      `/recurring-tasks/${id}`,
      data,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  delete: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(`/recurring-tasks/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  generate: async (id: string) => {
    const response = await api.post<{ success: boolean; data: { taskId: string } }>(
      `/recurring-tasks/${id}/generate`,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },
};

// ============================================================================
// EPICS
// ============================================================================

export interface Epic {
  id: string;
  name: string;
  description: string | null;
  color: string;
  status: string;
  organizationId: string;
  startDate: string | null;
  targetDate: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number };
}

export const epicsApi = {
  list: async () => {
    const response = await api.get<{ success: boolean; data: Epic[] }>('/epics');
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  create: async (data: { name: string; description?: string; color?: string; startDate?: string; targetDate?: string }) => {
    const response = await api.post<{ success: boolean; data: Epic }>('/epics', data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  update: async (id: string, data: Partial<{ name: string; description: string; color: string; startDate: string; targetDate: string }>) => {
    const response = await api.patch<{ success: boolean; data: Epic }>(`/epics/${id}`, data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  delete: async (id: string) => {
    const response = await api.delete<{ success: boolean; message: string }>(`/epics/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },
};

/** One day's row inside a schedule template's `entries` JSON. */
export interface ScheduleTemplateEntry {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  notes?: string;
}

/** A reusable weekly pattern ("Morning Shift", "Flex 4x10"). */
export interface ScheduleTemplate {
  id: string;
  name: string;
  description?: string | null;
  entries: ScheduleTemplateEntry[];
  organizationId: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * The organization as its settings screen edits it.
 *
 * Every field here is one the settings page reads; typing them turned four
 * `Record<string, any>` calls into something a rename can break at build time
 * rather than at the customer.
 */
export interface OrganizationProfile {
  id?: string;
  name?: string | null;
  description?: string | null;
  industry?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  timezone?: string | null;
  logoUrl?: string | null;
  /** `address` is the older single-line form kept for records that predate the split. */
  address?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  vatId?: string | null;
  billableRateCents?: number | null;
  usesExternalWorkers?: boolean | null;
  enabledModules?: string[] | null;
  notificationPrefs?: Record<string, boolean> | null;
  securitySettings?: Record<string, boolean | number> | null;
}

/** The paging envelope every list endpoint returns alongside its rows. */
export interface PaginationMeta {
  total: number;
  page: number;
  limit?: number;
  totalPages: number;
}

/**
 * An invoice as the API returns it — mirrors the Prisma model.
 *
 * Written out rather than left as `any`: the invoice screens read a dozen
 * fields off these objects and every one of them was unchecked, so a renamed
 * column reached production as a blank cell instead of a build error.
 */
export interface InvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  /** Set when the line came from a task or its service report. */
  taskId?: string | null;
  reportId?: string | null;
  createdAt: string;
}

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELED';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  /** The customer space being billed; null for an ad-hoc invoice. */
  spaceId?: string | null;
  clientName: string;
  clientEmail?: string | null;
  clientAddress?: string | null;
  subtotal: number;
  taxRate?: number | null;
  taxAmount: number;
  discount: number;
  total: number;
  currency: string;
  issueDate: string;
  dueDate?: string | null;
  paidAt?: string | null;
  notes?: string | null;
  organizationId: string;
  createdById: string;
  items: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
}

/** What a new invoice needs; everything else is server-decided. */
export interface CreateInvoiceInput {
  spaceId?: string | null;
  clientName: string;
  clientEmail?: string;
  clientAddress?: string;
  taxRate?: number;
  discount?: number;
  currency?: string;
  /** Both accepted by the server; it defaults issueDate to now when omitted. */
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  items?: Array<Omit<InvoiceItem, 'id' | 'invoiceId' | 'amount' | 'createdAt'> & { amount?: number }>;
}

export type UpdateInvoiceInput = Partial<CreateInvoiceInput>;

/** One line added to an existing invoice. */
export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taskId?: string | null;
  reportId?: string | null;
}

/** A part fitted during a job, priced for the invoice. */
export interface InvoiceGatherPart {
  name: string;
  partNumber?: string | null;
  quantity: number;
  unitCost: number;
  amount: number;
}

/** One completed job the gather endpoint offers as billable work. */
export interface InvoiceGatherEntry {
  taskId: string;
  taskTitle: string;
  reportId?: string | null;
  workerId?: string | null;
  workerName?: string | null;
  hours: number;
  laborAmount: number;
  completedAt?: string | null;
  notes?: string | null;
  parts: InvoiceGatherPart[];
  hasReport: boolean;
}

/**
 * Uninvoiced work for a space, with the client details pre-filled.
 *
 * Matches the gather handler field for field — it returns rather more than the
 * "list of lines" the screen's `as any` implied, including the hourly rate and
 * a per-worker hours summary.
 */
export interface InvoiceGatherResult {
  spaceId: string;
  clientName?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  currency: string;
  billableRateCents?: number | null;
  /** Currency units per hour, already divided out of the cents. */
  rate?: number | null;
  taskCount: number;
  totalHours: number;
  workerSummary: Array<{ name: string; hours: number }>;
  workEntries: InvoiceGatherEntry[];
}

export const invoicesApi = {
  list: async (params?: { status?: string; spaceId?: string; page?: number; limit?: number }) => {
    const endpoint = buildUrlWithQuery('/invoices', params ?? {});
    const response = await api.get<{ success: boolean; data: Invoice[]; meta?: PaginationMeta }>(endpoint);
    if (response.error) throw new Error(response.error);
    return response.data;
  },
  /** Build (unsaved) draft line items from a customer space's completed work. */
  gather: async (spaceId: string) => {
    const response = await api.get<{ success: boolean; data: InvoiceGatherResult }>(buildUrlWithQuery('/invoices/gather', { spaceId }));
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },
  getById: async (id: string) => {
    const response = await api.get<{ success: boolean; data: Invoice }>(`/invoices/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },
  create: async (data: CreateInvoiceInput): Promise<Invoice> => {
    const response = await api.post<{ success: boolean; data: Invoice }>('/invoices', data);
    if (response.error) throw new Error(response.error);
    // A create that comes back with no invoice is a failure, not a success with
    // nothing in it. The caller redirects to `invoice.id`, so returning
    // undefined here sent it to /invoices/undefined.
    if (!response.data?.data) throw new Error('The invoice was not created');
    return response.data.data;
  },
  update: async (id: string, data: UpdateInvoiceInput) => {
    const response = await api.patch<{ success: boolean; data: Invoice }>(`/invoices/${id}`, data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },
  updateStatus: async (id: string, status: string) => {
    const response = await api.patch<{ success: boolean; data: Invoice }>(`/invoices/${id}/status`, { status });
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },
  delete: async (id: string) => {
    const response = await api.delete<{ success: boolean }>(`/invoices/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },
  addItem: async (id: string, item: InvoiceItemInput) => {
    const response = await api.post<{ success: boolean; data: InvoiceItem }>(`/invoices/${id}/items`, item);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },
  removeItem: async (id: string, itemId: string) => {
    const response = await api.delete<{ success: boolean }>(`/invoices/${id}/items/${itemId}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Space Sharing — cross-org sharing of a space (board) with a guest org.
// ─────────────────────────────────────────────────────────────────────────────
export type SpaceShareLevel = 'VIEW' | 'CONTRIBUTE' | 'CONTROL';
export type SpaceShareStatus = 'PENDING' | 'ACTIVE' | 'REVOKED' | 'DECLINED';
export type SpaceShareRequestType = 'TASK' | 'WORKER';
export type SpaceShareRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** A share as seen by the OWNER of the space. */
export interface SpaceShare {
  id: string;
  spaceId: string;
  guestOrgName: string;
  level: SpaceShareLevel;
  status: SpaceShareStatus;
  showWorkers: boolean;
  showAttendance: boolean;
  showTracking: boolean;
  showReports: boolean;
  allowRequests: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** A share as seen by the GUEST org (adds space + owner naming). */
export interface SharedSpace extends SpaceShare {
  spaceName: string;
  ownerOrgName: string;
}

export interface SpaceShareRequest {
  id: string;
  spaceId: string;
  type: SpaceShareRequestType;
  title: string;
  note?: string | null;
  status: SpaceShareRequestStatus;
  createdAt: string;
}

export interface CreateSpaceShareInput {
  guestOrgCode: string;
  level: SpaceShareLevel;
  showWorkers: boolean;
  showAttendance: boolean;
  showTracking: boolean;
  showReports: boolean;
  allowRequests: boolean;
}

export interface UpdateSpaceShareInput {
  level?: SpaceShareLevel;
  showWorkers?: boolean;
  showAttendance?: boolean;
  showTracking?: boolean;
  showReports?: boolean;
  allowRequests?: boolean;
}

export const spaceSharingApi = {
  // ── Owner side ────────────────────────────────────────────────────────────
  /** List every share the owner has created on a space. */
  listShares: async (spaceId: string): Promise<SpaceShare[]> => {
    const res = await api.get<{ data: SpaceShare[] }>(`/locations/${spaceId}/shares`);
    if (res.error) throw new Error(res.error);
    return res.data?.data ?? [];
  },
  /** Invite a guest org (resolved by its secret join/share code) → PENDING share. */
  createShare: async (spaceId: string, input: CreateSpaceShareInput): Promise<SpaceShare> => {
    const res = await api.post<{ data: SpaceShare }>(`/locations/${spaceId}/shares`, input);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  updateShare: async (spaceId: string, shareId: string, input: UpdateSpaceShareInput): Promise<SpaceShare> => {
    const res = await api.patch<{ data: SpaceShare }>(`/locations/${spaceId}/shares/${shareId}`, input);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  /** Revoke a share. */
  revokeShare: async (spaceId: string, shareId: string): Promise<void> => {
    const res = await api.delete(`/locations/${spaceId}/shares/${shareId}`);
    if (res.error) throw new Error(res.error);
  },
  /** Incoming "request more" requests raised by guests on a space the owner owns. */
  listShareRequests: async (spaceId: string, status = 'PENDING'): Promise<SpaceShareRequest[]> => {
    const res = await api.get<{ data: SpaceShareRequest[] }>(
      buildUrlWithQuery(`/locations/${spaceId}/share-requests`, { status }),
    );
    if (res.error) throw new Error(res.error);
    return res.data?.data ?? [];
  },
  /** Approve / reject an incoming request. */
  resolveRequest: async (requestId: string, approve: boolean): Promise<void> => {
    const res = await api.patch(`/share-requests/${requestId}/resolve`, { approve });
    if (res.error) throw new Error(res.error);
  },

  // ── Guest side ────────────────────────────────────────────────────────────
  /** Spaces shared WITH the current org (PENDING invites + ACTIVE shares). */
  listSharedSpaces: async (): Promise<SharedSpace[]> => {
    const res = await api.get<{ data: SharedSpace[] }>('/shared-spaces');
    if (res.error) throw new Error(res.error);
    return res.data?.data ?? [];
  },
  /** Accept or decline a PENDING invite. */
  respondToShare: async (shareId: string, accept: boolean): Promise<void> => {
    const res = await api.post(`/shared-spaces/${shareId}/respond`, { accept });
    if (res.error) throw new Error(res.error);
  },
  /** Raise a "request more" (extra task / worker) against a shared space. */
  createGuestRequest: async (
    shareId: string,
    input: { type: SpaceShareRequestType; title: string; note?: string },
  ): Promise<SpaceShareRequest> => {
    const res = await api.post<{ data: SpaceShareRequest }>(`/shared-spaces/${shareId}/requests`, input);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  /** The guest org's own requests on a shared space. */
  listGuestRequests: async (spaceId: string, status?: string): Promise<SpaceShareRequest[]> => {
    const res = await api.get<{ data: SpaceShareRequest[] }>(
      buildUrlWithQuery(`/shared-spaces/${spaceId}/requests`, { status }),
    );
    if (res.error) throw new Error(res.error);
    return res.data?.data ?? [];
  },
};

export default api;
export { TimeEntryStatus, BreakType, InvitationStatus, JoinRequestStatus, JoinPolicy } from '@hbcfield/shared/client';

// ──────────────────────────────────────────────────────────────────────────────
// Billing / Subscriptions
// ──────────────────────────────────────────────────────────────────────────────
import type { SubscriptionView, PlanTier, BillingInterval, OrgCostBreakdown } from '@hbcfield/shared/client';

export const billingApi = {
  /** The itemised bill: seats, every space's modules and ladders, org add-ons. */
  getBill: async (): Promise<OrgCostBreakdown> => {
    const response = await api.get<OrgCostBreakdown>('/billing/bill');
    if (response.error) throw new Error(response.error);
    return response.data as OrgCostBreakdown;
  },

  /**
   * Replace the organization's add-ons. The WHOLE list — sending a subset
   * removes the rest, which is what the screen means by "these are the ones
   * I want".
   */
  setAddOns: async (addOns: string[]): Promise<string[]> => {
    const response = await api.put<string[]>('/billing/add-ons', { addOns });
    if (response.error) throw new Error(response.error);
    return response.data as string[];
  },

  /** Current org subscription/billing status. */
  getSubscription: async (): Promise<SubscriptionView> => {
    const response = await api.get<SubscriptionView>('/billing/subscription');
    if (response.error) throw new Error(response.error);
    return response.data as SubscriptionView;
  },

  /** Start Stripe Checkout for whatever the org already has → redirect URL. */
  checkout: async (): Promise<{ url: string }> => {
    const response = await api.post<{ url: string }>('/billing/checkout', {});
    if (response.error) throw new Error(response.error);
    return response.data as { url: string };
  },

  /** Open the Stripe Customer Portal (payment method, invoices, cancel). */
  portal: async (): Promise<{ url: string }> => {
    const response = await api.post<{ url: string }>('/billing/portal', {});
    if (response.error) throw new Error(response.error);
    return response.data as { url: string };
  },

  // No `changePlan`: it only ever switched monthly ↔ annual, and billing is
  // monthly. Everything else about the bill changes by switching a module on or
  // off where it lives, which reconciles on its own.

  /** Cancel at period end. */
  cancel: async (): Promise<void> => {
    const response = await api.post('/billing/cancel', {});
    if (response.error) throw new Error(response.error);
  },
};

// ============================================================================
// SUPPORT API (customer-facing)
// ============================================================================
import type { SupportTicket, SupportMessage, SupportAttachment } from '@hbcfield/shared/client';

export interface SupportConfig {
  tier: string | null;
  slaBusinessMinutes: number;
  liveChat: boolean;
  priorityRouting: boolean;
  dedicatedSupport: boolean;
}

export const supportApi = {
  getConfig: async (): Promise<SupportConfig> => {
    const res = await api.get<{ data: SupportConfig }>('/support/config');
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  list: async (status?: string): Promise<{ data: SupportTicket[]; meta: { total: number } }> => {
    const res = await api.get<{ data: SupportTicket[]; meta: { total: number } }>(
      `/support/tickets${status ? `?status=${status}` : ''}`,
    );
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  get: async (id: string): Promise<SupportTicket> => {
    const res = await api.get<{ data: SupportTicket }>(`/support/tickets/${id}`);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  create: async (payload: {
    subject: string;
    body: string;
    category?: string;
    channel?: string;
    attachments?: SupportAttachment[];
  }): Promise<SupportTicket> => {
    const res = await api.post<{ data: SupportTicket }>('/support/tickets', payload);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  reply: async (id: string, body: string, attachments?: SupportAttachment[]): Promise<SupportMessage> => {
    const res = await api.post<{ data: SupportMessage }>(`/support/tickets/${id}/messages`, { body, attachments });
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  markRead: async (id: string): Promise<void> => {
    await api.post(`/support/tickets/${id}/read`, {});
  },
};

// ============================================================================
// CHAT API (member-to-member)
// ============================================================================
import type { ChatConversation, ChatMessage, ChatUserRef, ChatAttachment } from '@hbcfield/shared/client';

export const chatApi = {
  contacts: async (): Promise<ChatUserRef[]> => {
    const res = await api.get<{ data: ChatUserRef[] }>('/chat/contacts');
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  conversations: async (): Promise<ChatConversation[]> => {
    const res = await api.get<{ data: ChatConversation[] }>('/chat/conversations');
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  openDirect: async (userId: string): Promise<ChatConversation> => {
    const res = await api.post<{ data: ChatConversation }>('/chat/conversations', { userId });
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  history: async (conversationId: string, before?: string): Promise<{ data: ChatMessage[]; hasMore: boolean }> => {
    const res = await api.get<{ data: ChatMessage[]; hasMore: boolean }>(
      `/chat/conversations/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    );
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  send: async (conversationId: string, body: string, attachments?: ChatAttachment[]): Promise<ChatMessage> => {
    const res = await api.post<{ data: ChatMessage }>(`/chat/conversations/${conversationId}/messages`, { body, attachments });
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  markRead: async (conversationId: string): Promise<void> => {
    await api.post(`/chat/conversations/${conversationId}/read`, {});
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Customers — first-class entity for customer-scoped work + reporting.
// ─────────────────────────────────────────────────────────────────────────────
export interface Customer {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  isPortalResident?: boolean;
  portalId?: string | null;
  // App-access status (only on the single-customer GET). invited = access granted;
  // accepted = signed up & has a login; entityLabel = the portal's entity.
  app?: { invited: boolean; accepted: boolean; active: boolean; portalName?: string | null; entityLabel?: string | null };
  spaceId?: string | null; // per-space CRM
  ownerId?: string | null; // sales owner
  managerIds?: string[]; // assigned sales managers
  status?: string; // CRM lifecycle stage
  // Person vs Company + B2B company fields
  type?: string; // PERSON | COMPANY
  legalName?: string | null;
  website?: string | null;
  industry?: string | null;
  vatId?: string | null;
  regNumber?: string | null;
  details?: CustomerDetail[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetail { label: string; value: string }

export type CustomerInput = Partial<Omit<Customer, "id" | "createdAt" | "updatedAt">>;

export interface CustomerAddress {
  id: string;
  customerId?: string | null;
  name: string;
  label?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  isPrimary: boolean;
  contactName?: string | null;
  contactPhone?: string | null;
}

// ── Per-space B2C portal (config + unit/apartment catalog) ──
export interface SpacePortalConfig { id: string; templateKey: string; entityLabel: string; name: string }
export interface SpaceUnit extends CustomerAddress {
  customer?: { id: string; name: string; email?: string | null; phone?: string | null } | null;
  residentUserId?: string | null;
  residentUser?: { id: string; firstName: string; lastName: string; avatarUrl?: string | null } | null;
  spaceId?: string | null;
  details?: { label: string; value: string }[] | null;
  createdAt?: string;
}

export interface UnitActivity {
  id: string;
  type: "NOTE" | "SYSTEM";
  body?: string | null;
  authorId?: string | null;
  metadata?: { resident?: string } | null;
  createdAt: string;
  author?: { id: string; firstName: string; lastName: string } | null;
}

export const spaceUnitsApi = {
  /** One apartment/unit by id (org-scoped) — for the apartment detail page. */
  get: async (unitId: string): Promise<SpaceUnit> => {
    const res = await api.get<{ data: SpaceUnit }>(`/units/${unitId}`);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  list: async (spaceId: string): Promise<SpaceUnit[]> => {
    const res = await api.get<{ data: SpaceUnit[] }>(`/spaces/${spaceId}/units`);
    if (res.error) throw new Error(res.error);
    return res.data?.data ?? [];
  },
  create: async (spaceId: string, input: { name?: string; address?: string; lat?: number; lng?: number; contactName?: string; contactPhone?: string; residentUserId?: string | null; customerId?: string | null; details?: { label: string; value: string }[] }): Promise<SpaceUnit> => {
    const res = await api.post<SpaceUnit>(`/spaces/${spaceId}/units`, input);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  update: async (spaceId: string, unitId: string, input: { name?: string; address?: string; lat?: number; lng?: number; contactName?: string | null; contactPhone?: string | null; residentUserId?: string | null; customerId?: string | null; details?: { label: string; value: string }[] }): Promise<SpaceUnit> => {
    const res = await api.patch<SpaceUnit>(`/spaces/${spaceId}/units/${unitId}`, input);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  remove: async (spaceId: string, unitId: string) => {
    const res = await api.delete<{ success: boolean }>(`/spaces/${spaceId}/units/${unitId}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
  /** Set (or clear, unitId=null) a member's apartment from the member side. */
  assignMember: async (spaceId: string, input: { userId: string; unitId: string | null }) => {
    const res = await api.post<{ data: { success: boolean; unitId: string | null } }>(`/spaces/${spaceId}/units/assign-member`, input);
    if (res.error) throw new Error(res.error);
    return res.data?.data;
  },
  // ── Apartment activity timeline (notes + system events) ──
  activities: async (unitId: string): Promise<UnitActivity[]> => {
    const res = await api.get<{ data: UnitActivity[] }>(`/units/${unitId}/activities`);
    if (res.error) throw new Error(res.error);
    return res.data?.data ?? [];
  },
  addNote: async (unitId: string, body: string): Promise<UnitActivity> => {
    const res = await api.post<{ data: UnitActivity }>(`/units/${unitId}/activities`, { body });
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
};

/** A portal whose entity is an Apartment (rental vertical). This is the switch
 *  that links apartments ↔ clients: only when a space runs one of these can an
 *  apartment host a CLIENT resident (vs. member-only housing). */
export const isApartmentPortal = (p: PortalSummary): boolean =>
  p.templateKey === "rental" || (p.entityLabel || "").toLowerCase().startsWith("apartment")

export const spacePortalApi = {
  /** All client portals bound to this space (a space can run several). */
  listPortals: async (spaceId: string): Promise<PortalSummary[]> => {
    const res = await api.get<PortalSummary[]>(`/spaces/${spaceId}/portal/portals`);
    if (res.error) throw new Error(res.error);
    return res.data ?? [];
  },
  createPortal: async (spaceId: string, templateKey: string, name?: string): Promise<{ id: string }> => {
    const res = await api.post<{ id: string }>(`/spaces/${spaceId}/portal/portals`, { templateKey, name });
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  get: async (spaceId: string): Promise<SpacePortalConfig> => {
    const res = await api.get<{ data: SpacePortalConfig }>(`/spaces/${spaceId}/portal`);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  setEntityType: async (spaceId: string, templateKey: string) => {
    const res = await api.patch<{ data: SpacePortalConfig }>(`/spaces/${spaceId}/portal`, { templateKey });
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  units: async (spaceId: string): Promise<SpaceUnit[]> => {
    const res = await api.get<{ data: SpaceUnit[] }>(`/spaces/${spaceId}/portal/units`);
    if (res.error) throw new Error(res.error);
    return res.data!.data ?? [];
  },
  addUnit: async (spaceId: string, input: { name?: string; address?: string; lat?: number; lng?: number }) => {
    const res = await api.post<SpaceUnit>(`/spaces/${spaceId}/portal/units`, input);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
  deleteUnit: async (spaceId: string, unitId: string) => {
    const res = await api.delete<{ success: boolean }>(`/spaces/${spaceId}/portal/units/${unitId}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
  assign: async (spaceId: string, unitId: string, customerId: string) => {
    const res = await api.post<{ data: { success: boolean } }>(`/spaces/${spaceId}/portal/units/${unitId}/assign`, { customerId });
    if (res.error) throw new Error(res.error);
    return res.data;
  },
};

export interface CustomerActivity {
  id: string;
  customerId: string;
  type: "NOTE" | "CALL" | "EMAIL" | "MEETING" | "REMINDER" | "STATUS" | "SYSTEM";
  body?: string | null;
  authorId?: string | null;
  dueAt?: string | null;
  doneAt?: string | null;
  reminderKind?: string | null; // CALL | EMAIL | MEETING | OTHER
  remindBeforeMin?: number | null;
  notifyAt?: string | null;
  reminderAssigneeId?: string | null;
  repeat?: string | null; // NONE | DAILY | WEEKLY | MONTHLY
  metadata?: { from?: string; to?: string } | null;
  createdAt: string;
  author?: { id: string; firstName: string; lastName: string | null } | null;
}

export const customersApi = {
  list: async (params?: { search?: string; status?: "active" | "inactive" | "all"; portalResident?: boolean; spaceId?: string; page?: number; limit?: number }) => {
    const qs = buildUrlWithQuery("/customers", params || {});
    const res = await api.get<{ data: Customer[]; meta: { total: number; page: number; limit: number; totalPages: number; crmCaps?: { view: "none" | "own" | "all"; work: boolean; editInfo: boolean; manage: boolean; canAccess: boolean } } }>(qs);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  /** Invite a space customer to the B2C app — returns the invite code. Pass
   *  portalId to bind them to a specific portal (= entity + categories) when the
   *  space runs several. Omit to auto-resolve (their unit's portal / the default). */
  invite: async (id: string, opts?: { email?: string; portalId?: string }) => {
    const res = await api.post<{ data: { code?: string; email?: string } }>(`/customers/${id}/invite`, { email: opts?.email, portalId: opts?.portalId });
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  resendInvite: async (id: string) => {
    const res = await api.post<{ data?: { code?: string; emailed?: boolean } }>(`/customers/${id}/resend-invite`, {});
    if (res.error) throw new Error(res.error);
    return res.data;
  },
  // ── CRM activity timeline ──
  activities: async (id: string) => {
    const res = await api.get<{ data: CustomerActivity[] }>(`/customers/${id}/activities`);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  addActivity: async (id: string, input: { type?: string; body?: string; dueAt?: string; reminderKind?: string; remindBeforeMin?: number; reminderAssigneeId?: string | null; repeat?: string }) => {
    const res = await api.post<{ data: CustomerActivity }>(`/customers/${id}/activities`, input);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  updateActivity: async (id: string, activityId: string, input: { body?: string; dueAt?: string | null; done?: boolean; reminderKind?: string; remindBeforeMin?: number; reminderAssigneeId?: string | null; repeat?: string }) => {
    const res = await api.patch<{ data: CustomerActivity }>(`/customers/${id}/activities/${activityId}`, input);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  removeActivity: async (id: string, activityId: string) => {
    const res = await api.delete<{ success: boolean }>(`/customers/${id}/activities/${activityId}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
  // ── Addresses (a customer's units; one primary → on the map) ──
  addresses: async (id: string): Promise<CustomerAddress[]> => {
    const res = await api.get<CustomerAddress[]>(`/customers/${id}/addresses`);
    if (res.error) throw new Error(res.error);
    return res.data ?? [];
  },
  addAddress: async (id: string, input: { name?: string; address?: string; lat?: number; lng?: number; isPrimary?: boolean; contactName?: string | null; contactPhone?: string | null }) => {
    const res = await api.post<CustomerAddress>(`/customers/${id}/addresses`, input);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
  updateAddress: async (id: string, unitId: string, input: { name?: string; address?: string; lat?: number; lng?: number; contactName?: string | null; contactPhone?: string | null }) => {
    const res = await api.patch<CustomerAddress>(`/customers/${id}/addresses/${unitId}`, input);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
  setPrimaryAddress: async (id: string, unitId: string) => {
    const res = await api.post<{ success: boolean }>(`/customers/${id}/addresses/${unitId}/primary`, {});
    if (res.error) throw new Error(res.error);
    return res.data;
  },
  removeAddress: async (id: string, unitId: string) => {
    const res = await api.delete<{ success: boolean }>(`/customers/${id}/addresses/${unitId}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
  get: async (id: string) => {
    const res = await api.get<{ data: Customer }>(`/customers/${id}`);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  create: async (dto: CustomerInput) => {
    const res = await api.post<{ data: Customer }>("/customers", dto);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  update: async (id: string, dto: CustomerInput) => {
    const res = await api.patch<{ data: Customer }>(`/customers/${id}`, dto);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  remove: async (id: string) => {
    const res = await api.delete<{ success: boolean }>(`/customers/${id}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Customer Portal (office-facing management: enable, units, requests)
// ─────────────────────────────────────────────────────────────────────────────
import type {
  IntakeCategory as PortalIntakeCategory,
  CustomerUnit as PortalCustomerUnit,
  PortalFeatureFlags,
  CustomerRequestView,
} from "@hbcfield/shared/client";

export type { PortalIntakeCategory, PortalCustomerUnit };

export interface PortalSummary {
  id: string;
  organizationId: string;
  name: string;
  templateKey: string;
  entityLabel: string;
  contactLabel?: string | null;
  accent?: string | null;
  isActive: boolean;
  residentCount: number;
  categoryCount: number;
}

export interface PortalDetail {
  id: string;
  name: string;
  enabled: boolean;
  templateKey: string;
  entityLabel: string;
  contactLabel: string;
  accent: string;
  coverImageUrl?: string | null;
  spaceId?: string | null;
  features: PortalFeatureFlags;
  categories: PortalIntakeCategory[];
}

/** A vacant apartment offered in the invite dialog (portal's space catalog). */
export interface PortalAvailableUnit {
  id: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** An existing CRM customer offered in the invite dialog (portal's space). */
export interface PortalAssignableCustomer {
  id: string;
  name: string;
  email?: string | null;
}

export interface PortalCategoryInput {
  portalId?: string;
  key?: string;
  label: string;
  icon?: string;
  color?: string;
  urgent?: boolean;
  team?: string;
  defaultPriority?: string | null;
  issues?: string[];
  position?: number;
}

export interface PortalUnitInput {
  customerId?: string;
  portalId?: string;
  name: string;
  label?: string | null;
  address?: string | null;
  spaceId?: string | null;
}

export const portalAdminApi = {
  // ── Portals ──
  listPortals: async () => {
    const res = await api.get<PortalSummary[]>("/portal/admin/portals");
    if (res.error) throw new Error(res.error);
    return res.data ?? [];
  },
  createPortal: async (templateKey: string, name?: string) => {
    const res = await api.post<PortalDetail>("/portal/admin/portals", { templateKey, name });
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  getPortal: async (id: string) => {
    const res = await api.get<PortalDetail>(`/portal/admin/portals/${id}`);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  updatePortal: async (id: string, input: { name?: string; templateKey?: string; reseed?: boolean; spaceId?: string | null }) => {
    const res = await api.patch<PortalDetail>(`/portal/admin/portals/${id}`, input);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  deletePortal: async (id: string) => {
    const res = await api.delete<{ success: boolean }>(`/portal/admin/portals/${id}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },

  // ── Intake categories (per portal) ──
  createCategory: async (input: PortalCategoryInput) => {
    const res = await api.post<PortalIntakeCategory>("/portal/admin/categories", input);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  updateCategory: async (id: string, input: Partial<PortalCategoryInput> & { isActive?: boolean }) => {
    const res = await api.patch<PortalIntakeCategory>(`/portal/admin/categories/${id}`, input);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  deleteCategory: async (id: string) => {
    const res = await api.delete<{ success: boolean }>(`/portal/admin/categories/${id}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
  reorderCategories: async (portalId: string, orderedIds: string[]) => {
    const res = await api.post<{ success: boolean }>("/portal/admin/categories/reorder", { portalId, orderedIds });
    if (res.error) throw new Error(res.error);
    return res.data;
  },

  // ── Residents (per portal) ──
  residents: async (portalId: string, search?: string) => {
    const res = await api.get<{ data: Customer[] }>(buildUrlWithQuery("/portal/admin/residents", { portalId, search }));
    if (res.error) throw new Error(res.error);
    return res.data?.data ?? [];
  },
  /** Vacant apartments in the portal's space — for the invite picker. */
  availableUnits: async (portalId: string): Promise<PortalAvailableUnit[]> => {
    const res = await api.get<{ data: PortalAvailableUnit[] }>(`/portal/admin/portals/${portalId}/available-units`);
    if (res.error) throw new Error(res.error);
    return res.data?.data ?? [];
  },
  /** Existing CRM customers (non-residents) in the portal's space — for the invite picker. */
  availableCustomers: async (portalId: string): Promise<PortalAssignableCustomer[]> => {
    const res = await api.get<{ data: PortalAssignableCustomer[] }>(`/portal/admin/portals/${portalId}/available-customers`);
    if (res.error) throw new Error(res.error);
    return res.data?.data ?? [];
  },
  // Pass customerId to promote an existing CRM customer, or name/email to create one.
  // Pass unitId to assign an existing vacant apartment, or unitName/unitAddress to create one.
  inviteResident: async (portalId: string, input: { customerId?: string; name?: string; email?: string; unitId?: string; unitName?: string; unitAddress?: string }) => {
    const res = await api.post<{ customer: Customer; unit: PortalCustomerUnit; code?: string }>("/portal/admin/residents", { portalId, ...input });
    if (res.error) throw new Error(res.error);
    return res.data!;
  },

  // Re-send a pending client's invite by email (uses the existing code).
  resendInvite: async (customerId: string) => {
    const res = await api.post<{ success: boolean; data?: { sentTo: string } }>(`/portal/admin/residents/${customerId}/resend-invite`, {});
    if (res.error) throw new Error(res.error);
    return res.data;
  },

  // Remove a client from the portal — revokes app access + detaches (record kept).
  removeResident: async (customerId: string) => {
    const res = await api.delete<{ data?: { success: boolean; deactivatedUserIds: string[] } }>(`/portal/admin/residents/${customerId}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },

  // ── Units + requests (per resident) ──
  listUnits: async (customerId?: string) => {
    const res = await api.get<PortalCustomerUnit[]>(buildUrlWithQuery("/portal/admin/units", { customerId }));
    if (res.error) throw new Error(res.error);
    return res.data ?? [];
  },
  createUnit: async (input: { customerId: string; name: string; address?: string | null }) => {
    const res = await api.post<PortalCustomerUnit>("/portal/admin/units", input);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  deleteUnit: async (id: string) => {
    const res = await api.delete<{ success: boolean }>(`/portal/admin/units/${id}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
  requests: async (customerId: string) => {
    const res = await api.get<{ data: CustomerRequestView[] }>(buildUrlWithQuery("/portal/admin/requests", { customerId }));
    if (res.error) throw new Error(res.error);
    return res.data?.data ?? [];
  },
  // Every request across a whole portal (office view; carries the client name).
  portalRequests: async (portalId: string) => {
    const res = await api.get<{ data: PortalRequestView[] }>(`/portal/admin/portals/${portalId}/requests`);
    if (res.error) throw new Error(res.error);
    return res.data?.data ?? [];
  },

  /** Route a pending request → live task (space + flow + priority + worker). */
  triageRequest: async (
    requestId: string,
    body: { spaceId: string; workflowId?: string | null; priority?: string; assignedToId?: string | null },
  ) => {
    const res = await api.post(`/portal/admin/requests/${requestId}/triage`, body);
    if (res.error) throw new Error(res.error);
    return res.data;
  },

  /** Upload a portal cover/hero image (client-home background). */
  uploadCover: async (portalId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const token = getAccessToken();
    const response = await fetch(`${API_BASE_URL}/portal/admin/portals/${portalId}/cover`, {
      method: "POST",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
      credentials: "include",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.message || "Upload failed");
    }
    const data = await response.json();
    return data.data as { coverImageUrl: string };
  },

  removeCover: async (portalId: string) => {
    const res = await api.delete(`/portal/admin/portals/${portalId}/cover`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
};

export interface PortalRequestView extends CustomerRequestView {
  customerId: string | null;
  customerName: string | null;
  updatedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics / Reports — dynamic report engine (semantic registry + query engine)
// ─────────────────────────────────────────────────────────────────────────────
export type ReportGranularity = "none" | "day" | "week" | "month" | "quarter" | "year";
export type ReportDatePreset = "last_7d" | "last_30d" | "last_90d" | "this_month" | "last_month" | "this_year" | "all";

export interface ReportDefinition {
  dataset: string;
  measures: string[];
  dimensions?: string[];
  granularity?: ReportGranularity;
  dateRange?: { preset?: ReportDatePreset; from?: string; to?: string };
  filters?: Array<{ field: string; op: "eq" | "neq" | "in"; value: string | number | Array<string | number> }>;
  sort?: { key: string; dir: "asc" | "desc" };
  limit?: number;
}

export interface ReportColumn { key: string; label: string; kind: "dimension" | "measure" | "period"; format?: string }
export interface ReportResult { columns: ReportColumn[]; rows: Array<Record<string, unknown>> }

export interface ReportTemplate { key: string; name: string; description: string; def: ReportDefinition }
export interface DatasetMeta {
  key: string;
  label: string;
  dimensions: Array<{ key: string; label: string; type: string }>;
  measures: Array<{ key: string; label: string; format: string }>;
}

export interface SavedReport {
  id: string;
  name: string;
  description?: string | null;
  dataset: string;
  config: ReportDefinition;
  isShared: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export const analyticsApi = {
  catalog: async () => {
    const res = await api.get<{ data: { datasets: DatasetMeta[]; templates: ReportTemplate[] } }>("/analytics/catalog");
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  run: async (definition: ReportDefinition) => {
    const res = await api.post<{ data: ReportResult }>("/analytics/run", { definition });
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  timesheet: async (userId: string, params?: { from?: string; to?: string }) => {
    const qs = buildUrlWithQuery("/analytics/timesheet", { userId, ...(params || {}) });
    const res = await api.get<{ data: ReportResult & { userName: string } }>(qs);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  listSaved: async () => {
    const res = await api.get<{ data: SavedReport[] }>("/analytics/reports");
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  createSaved: async (input: { name: string; description?: string; config: ReportDefinition; isShared?: boolean }) => {
    const res = await api.post<{ data: SavedReport }>("/analytics/reports", input);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  updateSaved: async (id: string, input: { name?: string; description?: string; config?: ReportDefinition; isShared?: boolean }) => {
    const res = await api.patch<{ data: SavedReport }>(`/analytics/reports/${id}`, input);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  deleteSaved: async (id: string) => {
    const res = await api.delete<{ success: boolean }>(`/analytics/reports/${id}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
  // ── Scheduled delivery ──
  listSchedules: async (reportId?: string) => {
    const res = await api.get<{ data: ReportSchedule[] }>(`/analytics/schedules${reportId ? `?reportId=${reportId}` : ""}`);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  createSchedule: async (input: ScheduleInput) => {
    const res = await api.post<{ data: ReportSchedule }>("/analytics/schedules", input);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  updateSchedule: async (id: string, input: Partial<ScheduleInput>) => {
    const res = await api.patch<{ data: ReportSchedule }>(`/analytics/schedules/${id}`, input);
    if (res.error) throw new Error(res.error);
    return res.data!.data;
  },
  deleteSchedule: async (id: string) => {
    const res = await api.delete<{ success: boolean }>(`/analytics/schedules/${id}`);
    if (res.error) throw new Error(res.error);
    return res.data;
  },
};

export type ReportCadence = "daily" | "weekly" | "monthly";
export interface ReportSchedule {
  id: string;
  reportDefinitionId: string;
  cadence: ReportCadence;
  hour: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  recipients: string[];
  isActive: boolean;
  lastRunAt?: string | null;
  nextRunAt: string;
  createdAt: string;
}
export interface ScheduleInput {
  reportDefinitionId: string;
  cadence: ReportCadence;
  hour?: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  recipients: string[];
  isActive?: boolean;
}

// ===========================================================================
// Global search (command palette) — unified across tasks, people, spaces, customers
// ===========================================================================
export interface GlobalSearchResults {
  tasks: { id: string; title: string; status: string }[];
  members: { id: string; firstName: string; lastName: string; email: string | null; avatarUrl: string | null }[];
  spaces: { id: string; name: string; address: string | null }[];
  customers: { id: string; name: string; contactName: string | null }[];
}

export const searchApi = {
  global: async (q: string): Promise<GlobalSearchResults> => {
    const empty: GlobalSearchResults = { tasks: [], members: [], spaces: [], customers: [] };
    if (!q || q.trim().length < 2) return empty;
    const res = await api.get<GlobalSearchResults>(buildUrlWithQuery('/search', { q: q.trim() }));
    if (res.error) throw new Error(res.error);
    return res.data ?? empty;
  },
};



// ============================================================================
// DOCUMENTS API — the personnel file
// ============================================================================

export interface RequirementRow {
  typeId: string;
  label: string;
  state: 'MISSING' | 'AWAITING_REVIEW' | 'REJECTED' | 'MET' | 'EXPIRING' | 'EXPIRED';
  expiresOn: string | null;
  blocksWork: boolean;
}

/** What the signed-in member still has to do, of either kind. */
export interface PendingDocumentsSummary {
  toUpload: RequirementRow[]
  expiring: RequirementRow[]
  /*
    `forMember` names the person the document is about, and is set only when
    that is somebody other than you — a responsible countersigning a worker's
    time sheet. Null on your own documents.
  */
  toSign: { id: string; title: string; forMember?: string | null }[]
}

export interface PendingReviewRow {
  id: string;
  title: string;
  submittedAt: string;
  expiresOn: string | null;
  sizeBytes: number;
  mimeType: string;
  member: { id: string; firstName: string; lastName: string };
  typeId: string;
  typeLabel: string;
  isCredential: boolean;
  /** Somebody is out of the assignable pool until this is approved. */
  blocksWork: boolean;
  standing: 'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING' | null;
  /** Present only when the document was scanned rather than photographed. */
  scanFormat: string | null;
  scanVerdict: 'CONSISTENT' | 'UNVERIFIED' | 'SUSPECT' | null;
  scanChecks: { id: string; outcome: 'PASS' | 'FAIL' | 'WARN' | 'SKIP'; detail?: string }[] | null;
  holderName: string | null;
  documentNumber: string | null;
}

export interface MemberDocumentRow {
  id: string;
  title: string;
  typeId: string;
  typeKey: string;
  typeLabel: string;
  periodYear: number | null;
  periodMonth: number | null;
  status: string;
  sizeBytes: number;
  mimeType: string;
  issuedAt: string;
  expiresOn: string | null;
  unread: boolean;
  needsSignature: boolean;
  standing: 'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING' | null;
  /**
   * Whose document this is, when it is not yours.
   *
   * Set only on a document waiting on your signature that belongs to somebody
   * else — a responsible countersigning a worker's time sheet. Null on your
   * own, where naming the person would be naming the reader.
   */
  forMember?: string | null
  /** Why a reviewer refused something the member supplied. */
  rejectionReason?: string | null;
}

export interface DocumentTypeRow {
  id: string;
  key: string;
  label: string;
  description: string | null;
  cadence: 'MONTHLY' | 'ANNUAL' | 'ONE_OFF';
  direction: 'ISSUED' | 'SUPPLIED';
  retentionMonths: number | null;
  signatureMode: 'NONE' | 'ACKNOWLEDGE' | 'IN_APP' | 'WET_INK';
  isCredential: boolean;
  hasExpiry: boolean;
  requiredForWorkflowIds: string[];
  /** Every member must provide one. */
  requiredFromAll: boolean;
  /** Only members holding one of these roles must. */
  requiredFromRoleIds: string[];
  /** The scanner asks for the back as well — ID cards and licences, not passports. */
  twoSided: boolean;
  /** The frame the scanner draws: a passport page is not the shape of a card. */
  scanShape: 'CARD' | 'PASSPORT' | 'PAGE';
  isActive: boolean;
  position: number;
  /**
   * The signing route: an ordered list of {role}, or null for one signature.
   *
   * Deliberately loose here. The shape is owned and validated by the server —
   * a second definition on the client is a second place for it to be wrong.
   */
  signerRoute?: Array<{ role: string }> | null
}

export interface MatchCandidateRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /** For resolving which members a contract template would reach. */
  memberRoleId?: string | null;
  position?: string | null;
}

export interface DraftDocumentRow {
  id: string;
  title: string;
  periodYear: number | null;
  periodMonth: number | null;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string };
  type: { id: string; label: string; signatureMode: string };
  /**
   * The route resolved for THIS member, when the type has one.
   *
   * Null for a type with no route. A step with one candidate needs no question;
   * a step with several is what the picker is for; a step with none becomes a
   * skipped step rather than blocking the publish.
   */
  routeSteps?: RouteCandidateStep[] | null;
}

/** One person or client a route step could resolve to. */
export interface SignerCandidate {
  kind: "USER" | "CUSTOMER";
  id: string;
  name: string;
  email: string | null;
}

export interface RouteCandidateStep {
  order: number;
  role: string;
  candidates: SignerCandidate[];
}

/** One row of the issued-document register. Carries no url, by design. */
export interface IssuedRow {
  id: string
  title: string
  status: string
  periodYear: number | null
  periodMonth: number | null
  issuedAt: string
  openedAt: string | null
  signedAt: string | null
  expiresOn: string | null
  sizeBytes: number
  mimeType: string
  memberId: string
  memberName: string
  typeId: string
  typeLabel: string
  signatureMode: string
  isCredential: boolean
  /** Null for a document whose type has no route — not an empty chain. */
  chain?: DocumentChain | null
}

/** A folder in the cabinet: a type, a member, or a year. */
export interface BrowseFolder {
  kind: "type" | "member" | "year"
  key: string
  /** Null for the undated folder, which the client names in the user's language. */
  label: string | null
  undated: boolean
  count: number
}

export interface BrowseLevel {
  groupBy: "type" | "member" | "year"
  level: "type" | "member" | "year" | "documents"
  folders: BrowseFolder[]
  documents: IssuedRow[]
}

/** Where a document has got to, when its type has a signing route. */
export interface DocumentChain {
  total: number
  signed: number
  complete: boolean
  currentOrder: number | null
  currentRole: string | null
  waitingOn: string | null
  /** When the current signer was told. Null if they have not been notified. */
  waitingSince: string | null
}

export interface IssuedRegister {
  rows: IssuedRow[]
  page: number
  limit: number
  total: number
  counts: { awaiting: number; unopened: number; signed: number; all: number }
}

export interface ComplianceRow {
  id: string;
  title: string;
  expiresOn: string | null;
  member: { id: string; firstName: string; lastName: string };
  credential: string;
  standing: 'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING';
  daysLeft: number | null;
  /** True only when a LAPSED credential actually gates a task type. */
  blocksDispatch: boolean;
  gatesTaskTypes: string[];
}

export interface ContractTemplateRow {
  id: string;
  name: string;
  body: string;
  typeId: string;
  type: { id: string; label: string };
  appliesToRoleId: string | null;
  appliesToRole: { id: string; name: string; slug: string } | null;
  appliesToPosition: string | null;
  signatureMode: 'NONE' | 'ACKNOWLEDGE' | 'IN_APP' | 'WET_INK';
  offerValidDays: number | null;
  version: number;
  isActive: boolean;
}

export interface DocumentEventRow {
  id: string;
  type: string;
  at: string;
  actorId: string | null;
  actor: { id: string; firstName: string; lastName: string } | null;
  ip: string | null;
  userAgent: string | null;
  appVersion: string | null;
}

/**
 * Unwrap a documents response.
 *
 * These routes return the payload BARE — `[…]` or `{…}` — not wrapped in
 * `{ success, data }` like most of this file. Reading `response.data.data` gave
 * `undefined`, `|| []` turned that into an empty list, and every document
 * screen rendered "Nothing here yet" against a database with 184 documents in
 * it. Nothing errored; the data was simply thrown away on arrival.
 *
 * One helper rather than the same guard at twenty call sites: whichever shape
 * arrives, the caller gets the payload.
 */
function unwrapDocuments<T>(response: { data?: unknown; error?: string }): T | undefined {
  if (response.error) throw new Error(response.error);
  const body = response.data as any;
  if (body === null || body === undefined) return undefined;
  // A wrapped payload carries `data`; a bare array or object is itself.
  if (!Array.isArray(body) && typeof body === 'object' && 'data' in body) {
    return body.data as T;
  }
  return body as T;
}

export interface TemplatePreview {
  /** The PDF, base64. Null when only the values were asked for. */
  pdf: string | null;
  /** Every merge field resolved for one real member; '—' where the record is blank. */
  values: Record<string, string>;
  filledFor: string | null;
  missing: string[];
}

export const documentsApi = {
  listTypes: async (includeInactive = false) => {
    const response = await api.get<{ success: boolean; data: DocumentTypeRow[] }>(
      buildUrlWithQuery('/documents/types', { includeInactive: includeInactive || undefined }),
    );
    return unwrapDocuments<any[]>(response) ?? [];
  },

  createType: async (data: Partial<DocumentTypeRow> & { key: string; label: string }) => {
    const response = await api.post<{ success: boolean; data: DocumentTypeRow }>('/documents/types', data);
    return unwrapDocuments<any>(response);
  },

  updateType: async (id: string, data: Partial<DocumentTypeRow>) => {
    const response = await api.patch<{ success: boolean; data: DocumentTypeRow }>(`/documents/types/${id}`, data);
    return unwrapDocuments<any>(response);
  },

  deactivateType: async (id: string) => {
    const response = await api.delete<{ success: boolean }>(`/documents/types/${id}`);
    return unwrapDocuments<any>(response);
  },

  /** Omit `userId` for your own file. */
  list: async (params?: { userId?: string; typeId?: string; year?: number; search?: string }) => {
    const response = await api.get<{ success: boolean; data: MemberDocumentRow[] }>(
      buildUrlWithQuery('/documents', {
        userId: params?.userId,
        typeId: params?.typeId,
        year: params?.year,
        search: params?.search,
      }),
    );
    return unwrapDocuments<any[]>(response) ?? [];
  },

  /*
    A POST, not a GET, and never called from a list.

    Minting the link IS the "opened" event on the evidence trail. A GET would be
    prefetched by browsers and scanned by link checkers, and the record of who
    read their contract would fill up with robots.
  */
  downloadUrl: async (id: string) => {
    const response = await api.post<{ success: boolean; data: { url: string; fileName: string } }>(
      `/documents/${id}/download-url`,
      {},
    );
    return unwrapDocuments<any>(response);
  },

  events: async (id: string) => {
    const response = await api.get<{ success: boolean; data: DocumentEventRow[] }>(`/documents/${id}/events`);
    return unwrapDocuments<any[]>(response) ?? [];
  },

  /** Step 1 of issuing: a link the browser PUTs the file to directly. */
  uploadUrl: async (data: { userId: string; typeId: string; mimeType: string; sizeBytes: number }) => {
    const response = await api.post<{
      success: boolean;
      data: { url: string; key: string; headers: Record<string, string>; expiresInSeconds: number };
    }>('/documents/upload-url', data);
    return unwrapDocuments<any>(response);
  },

  /** Step 2: the server reads the bytes back, hashes them, and files the row. */
  confirm: async (data: {
    stagingKey: string;
    userId: string;
    typeId: string;
    title: string;
    periodYear?: number;
    periodMonth?: number;
    expiresOn?: string;
    /** Stage it: invisible to the member, no notification, until published. */
    asDraft?: boolean;
  }) => {
    const response = await api.post<{ success: boolean; data: MemberDocumentRow }>('/documents', data);
    return unwrapDocuments<any>(response);
  },

  /** What the organization still expects from you (or, with an id, from them). */
  requirements: async (userId?: string) => {
    const response = await api.get<{ success: boolean; data: RequirementRow[] }>(
      buildUrlWithQuery('/documents/requirements', { userId }),
    );
    return unwrapDocuments<RequirementRow[]>(response) ?? [];
  },

  /**
   * Everything personally outstanding, in one request.
   *
   * Separate from `requirements` because a reminder needs BOTH kinds — types to
   * supply and documents awaiting a signature — and two requests for one badge
   * is how a reminder ends up removed again for being slow. Self only: it takes
   * no userId, because a summary endpoint that accepts somebody else's is a
   * convenient way to find out who is behind on what.
   */
  pending: async () => {
    const response = await api.get<{ success: boolean; data: PendingDocumentsSummary }>(
      '/documents/pending',
    );
    return (
      unwrapDocuments<PendingDocumentsSummary>(response) ?? { toUpload: [], expiring: [], toSign: [] }
    );
  },

  // ── Reviewing what members supplied ──────────────────────────────────────

  awaitingVerification: async () => {
    const response = await api.get<{ success: boolean; data: PendingReviewRow[] }>(
      '/documents/awaiting-verification',
    );
    return unwrapDocuments<PendingReviewRow[]>(response) ?? [];
  },

  /** Accept it. From here it counts — the dispatch gate reads the status. */
  verify: async (id: string) => {
    const response = await api.post<{ success: boolean }>(`/documents/${id}/verify`, {});
    return unwrapDocuments<any>(response);
  },

  /** Refuse it. The reason is required, because the member reads it. */
  reject: async (id: string, reason: string) => {
    const response = await api.post<{ success: boolean }>(`/documents/${id}/reject`, { reason });
    return unwrapDocuments<any>(response);
  },

  // ── What the member supplies themselves ──────────────────────────────────
  //
  // No userId on either: the member is the token. The server checks the TYPE
  // instead — SUPPLIED only — so this can never file somebody a payslip.

  /** Step 1: somewhere to PUT your own file. */
  ownUploadUrl: async (data: { typeId: string; mimeType: string; sizeBytes: number }) => {
    const response = await api.post<{
      success: boolean;
      data: { url: string; key: string; headers: Record<string, string>; expiresInSeconds: number };
    }>('/documents/mine/upload-url', data);
    return unwrapDocuments<{ url: string; key: string }>(response);
  },

  /**
   * Between the two: what is actually on the picture.
   *
   * Files nothing. The member sees what was read and confirms it, instead of
   * typing a date the server was going to overrule anyway.
   */
  readOwnUpload: async (stagingKey: string) => {
    const response = await api.post<{
      success: boolean;
      data: {
        source: 'MRZ' | 'TEXT' | 'NOTHING';
        expiresOn: string | null;
        fields: { holderName: string | null; documentNumber: string | null } | null;
        verdict: 'CONSISTENT' | 'UNVERIFIED' | 'SUSPECT' | null;
      };
    }>('/documents/mine/read', { stagingKey });
    return unwrapDocuments<{
      source: 'MRZ' | 'TEXT' | 'NOTHING';
      expiresOn: string | null;
      fields: { holderName: string | null; documentNumber: string | null } | null;
      verdict: 'CONSISTENT' | 'UNVERIFIED' | 'SUSPECT' | null;
    }>(response);
  },

  /** Step 2: file it for review. It lands PENDING_VERIFICATION, never ISSUED. */
  submitOwn: async (data: {
    stagingKey: string;
    typeId: string;
    title?: string;
    expiresOn?: string;
  }) => {
    const response = await api.post<{ success: boolean; data: MemberDocumentRow }>('/documents/mine', data);
    return unwrapDocuments<MemberDocumentRow>(response);
  },

  revoke: async (id: string) => {
    const response = await api.post<{ success: boolean }>(`/documents/${id}/revoke`, {});
    return unwrapDocuments<any>(response);
  },

  /**
   * Everything in your file, as a manifest plus one link each.
   *
   * Not an archive: the server never assembles fifty documents in memory. The
   * browser follows the links, which is what the links are for.
   */
  exportMine: async (userId?: string) => {
    const response = await api.post<{
      success: boolean;
      data: {
        exportedAt: string;
        count: number;
        files: {
          title: string; type: string; issuedAt: string; sizeBytes: number;
          sha256: string; signedAt: string | null; url: string;
        }[];
      };
    }>('/documents/export', userId ? { userId } : {});
    return unwrapDocuments<any>(response);
  },

  // ── Credentials ──────────────────────────────────────────────────────────

  // ── The filing cabinet ───────────────────────────────────────────────────

  /**
   * One level of folders, never the whole tree.
   *
   * Each call returns just the children of the path given, with counts, so the
   * cost of drawing a folder does not grow with the size of the archive.
   */
  browse: async (params: {
    groupBy?: "type" | "member" | "year"
    typeId?: string
    userId?: string
    year?: number
    undated?: boolean
  }) => {
    const response = await api.get<{ success: boolean; data: BrowseLevel }>(
      buildUrlWithQuery("/documents/browse", {
        groupBy: params.groupBy,
        typeId: params.typeId,
        userId: params.userId,
        year: params.year,
        undated: params.undated ? "true" : undefined,
      }),
    )
    return (
      unwrapDocuments<BrowseLevel>(response) ?? {
        groupBy: params.groupBy ?? "type",
        level: "type" as const,
        folders: [],
        documents: [],
      }
    )
  },

  // ── The register ─────────────────────────────────────────────────────────

  /**
   * Everything the organization has issued, by state.
   *
   * Carries no urls: a link is minted only by opening a document, and that mint
   * is what records the delivery evidence.
   */
  listIssued: async (params?: {
    tab?: "awaiting" | "unopened" | "signed" | "all"
    typeId?: string
    userId?: string
    year?: number
    search?: string
    page?: number
    limit?: number
  }) => {
    const response = await api.get<{ success: boolean; data: IssuedRegister }>(
      buildUrlWithQuery("/documents/sent", {
        tab: params?.tab,
        typeId: params?.typeId,
        userId: params?.userId,
        year: params?.year,
        search: params?.search,
        page: params?.page,
        limit: params?.limit,
      }),
    )
    // An empty register rather than undefined: the screen renders the same way
    // for "nothing issued" and for a response the unwrapper did not recognise,
    // and neither is an error worth showing an admin.
    return (
      unwrapDocuments<IssuedRegister>(response) ?? {
        rows: [],
        page: 1,
        limit: 25,
        total: 0,
        counts: { awaiting: 0, unopened: 0, signed: 0, all: 0 },
      }
    )
  },

  /** Validity and dates only — never the certificate itself. */
  compliance: async () => {
    const response = await api.get<{ success: boolean; data: ComplianceRow[] }>('/documents/compliance');
    return unwrapDocuments<any[]>(response) ?? [];
  },

  // ── Signing ──────────────────────────────────────────────────────────────

  /** Record agreement to sign electronically. Its own act, before the drawing. */
  consent: async (id: string) => {
    const response = await api.post<{ success: boolean; data: { consentText: string; consentAt: string } }>(
      `/documents/${id}/consent`, {},
    );
    return unwrapDocuments<any>(response);
  },

  /**
   * Sign, seal and freeze.
   *
   * The idempotency key is made ONCE per attempt and reused on every retry, so
   * a dropped connection returns the existing seal instead of signing twice.
   */
  sign: async (id: string, body: { signatureImage: string; idempotencyKey: string }) => {
    const response = await api.post<{ success: boolean; data: { documentId: string; alreadySigned: boolean } }>(
      `/documents/${id}/sign`, body,
    );
    return unwrapDocuments<any>(response);
  },

  /** "I have read this" — receipt, not agreement. */
  acknowledge: async (id: string) => {
    const response = await api.post<{ success: boolean }>(`/documents/${id}/acknowledge`, {});
    return unwrapDocuments<any>(response);
  },

  // ── Templates ────────────────────────────────────────────────────────────

  listTemplates: async (includeInactive = false) => {
    const response = await api.get<{ success: boolean; data: ContractTemplateRow[] }>(
      buildUrlWithQuery('/documents/templates', { includeInactive: includeInactive || undefined }),
    );
    return unwrapDocuments<any[]>(response) ?? [];
  },

  createTemplate: async (data: {
    typeId: string; name: string; body: string;
    appliesToRoleId?: string; appliesToPosition?: string;
    signatureMode?: string; offerValidDays?: number;
  }) => {
    const response = await api.post<{ success: boolean; data: ContractTemplateRow }>('/documents/templates', data);
    return unwrapDocuments<any>(response);
  },

  /**
   * The draft laid out as the PDF a member would receive.
   *
   * Returns base64 rather than a URL because nothing is stored — there is no
   * object to presign, and a preview that had to be written to storage first
   * would leave a trail of dead files behind every edit.
   */
  previewTemplate: async (data: { body?: string; title?: string; memberId?: string }) => {
    const response = await api.post<{ success: boolean; data: TemplatePreview }>(
      '/documents/templates/preview', data,
    );
    return unwrapDocuments<TemplatePreview>(response);
  },

  updateTemplate: async (id: string, data: Record<string, unknown>) => {
    const response = await api.patch<{ success: boolean; data: ContractTemplateRow }>(`/documents/templates/${id}`, data);
    return unwrapDocuments<any>(response);
  },

  deactivateTemplate: async (id: string) => {
    const response = await api.delete<{ success: boolean }>(`/documents/templates/${id}`);
    return unwrapDocuments<any>(response);
  },

  /** Render and issue a contract to one member. */
  issueContract: async (data: {
    userId: string; templateId?: string; startDate?: string; weeklyHours?: number;
  }) => {
    const response = await api.post<{ success: boolean; data: MemberDocumentRow }>('/documents/issue-contract', data);
    return unwrapDocuments<any>(response);
  },

  // ── Payroll day ──────────────────────────────────────────────────────────

  /** The members a batch can be matched against. Matching runs in the browser. */
  matchCandidates: async () => {
    const response = await api.get<{ success: boolean; data: MatchCandidateRow[] }>(
      '/documents/match-candidates',
    );
    return unwrapDocuments<any[]>(response) ?? [];
  },

  listDrafts: async () => {
    const response = await api.get<{ success: boolean; data: DraftDocumentRow[] }>('/documents/drafts');
    return unwrapDocuments<any[]>(response) ?? [];
  },

  /** All or nothing — one unresolved row blocks the whole batch. */
  publishBatch: async (
    documentIds: string[],
    signerChoices?: Array<{
      documentId: string
      choices: Array<{ order: number; userId?: string | null; customerId?: string | null }>
    }>,
  ) => {
    const response = await api.post<{ success: boolean; data: { published: number } }>(
      "/documents/publish",
      { documentIds, ...(signerChoices?.length ? { signerChoices } : {}) },
    )
    return unwrapDocuments<{ published: number }>(response)
  },

  discardDraft: async (id: string) => {
    const response = await api.delete<{ success: boolean }>(`/documents/drafts/${id}`);
    return unwrapDocuments<any>(response);
  },

  /** Only ever your own, and only what you supplied. */
  remove: async (id: string) => {
    const response = await api.delete<{ success: boolean }>(`/documents/${id}`);
    return unwrapDocuments<any>(response);
  },
};

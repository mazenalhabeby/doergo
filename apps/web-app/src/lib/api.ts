/**
 * API Client for HBCField Backend
 *
 * Handles all HTTP communication with the API gateway.
 * Implements standard OAuth 2.0 token refresh with:
 * - Automatic 401 handling with token refresh and request retry
 * - Request queue to prevent multiple concurrent refresh attempts
 * - Proactive refresh before token expiry
 */

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
        // Custom role
        orgRole?: { id: string; name: string; slug: string; color?: string | null } | null;
        rolePermissions?: Record<string, boolean>;
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
  position?: number;
}

export interface TasksQueryParams {
  status?: string;
  priority?: string;
  page?: number;
  limit?: number;
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
  updateMe: async (data: { firstName?: string; lastName?: string; presence?: 'AVAILABLE' | 'BUSY' | 'AWAY' | null; timeFormat?: '12h' | '24h' }) => {
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
  getStatusCounts: async () => {
    const response = await api.get<StatusCountsResponse>('/tasks/counts');

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data || {};
  },

  // Get all tasks with optional filters
  list: async (params?: TasksQueryParams) => {
    const endpoint = buildUrlWithQuery('/tasks', {
      status: params?.status !== 'all' ? params?.status : undefined,
      priority: params?.priority !== 'all' ? params?.priority : undefined,
      page: params?.page,
      limit: params?.limit,
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

export interface CreateAssetCategoryInput {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
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
  // CATEGORIES
  // ============================================

  // Get all categories for organization
  getCategories: async () => {
    const response = await api.get<{ success: boolean; data: AssetCategory[] }>('/asset-categories');

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
  getAssetHistory: async (assetId: string) => {
    const response = await api.get<{ success: boolean; data: MaintenanceHistoryItem[] }>(
      `/assets/${assetId}/history`
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

// Attendance API methods (ADMIN/DISPATCHER only)
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

  // Admin: correct a time entry (clock-in/out and/or notes). A reason is
  // required and the original values are preserved for audit server-side.
  editEntry: async (
    entryId: string,
    input: { clockInAt?: string; clockOutAt?: string; notes?: string; reason: string }
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

  // Get all time entries for the organization (admin view)
  getAllEntries: async (params?: AttendanceQueryParams) => {
    const endpoint = buildUrlWithQuery('/attendance/all-entries', params ?? {});

    const response = await api.get<AttendanceListResponse>(endpoint);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // Get scheduler info (ADMIN only)
  getSchedulerInfo: async () => {
    const response = await api.get<{
      repeatableJobs: Array<{
        name: string;
        id: string;
        pattern?: string;
        every?: number;
        next: string | null;
      }>;
      queueStats: {
        waiting: number;
        active: number;
        delayed: number;
        completed: number;
        failed: number;
      };
    }>('/attendance/scheduler/info');

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data;
  },

  // Manually trigger auto clock-out (ADMIN only)
  triggerAutoClockOut: async (type: 'hourly' | 'midnight' = 'hourly') => {
    const response = await api.post<{
      success: boolean;
      data: {
        type: string;
        processedCount: number;
        entryIds: string[];
        message: string;
      };
    }>(`/attendance/scheduler/trigger?type=${type}`, {});

    if (response.error) {
      throw new Error(response.error);
    }

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

  // Request time off
  requestTimeOff: async (id: string, data: { startDate: string; endDate: string; reason?: string }) => {
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

    if (response.error) {
      throw new Error(response.error);
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
    const response = await api.get<{ success: boolean; data: any[] }>('/employees/schedule-templates');
    if (response.error) throw new Error(response.error);
    return response.data?.data || [];
  },

  createScheduleTemplate: async (data: { name: string; description?: string; entries: any[] }) => {
    const response = await api.post<{ success: boolean; data: any }>('/employees/schedule-templates', data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  deleteScheduleTemplate: async (id: string) => {
    const response = await api.delete<{ success: boolean }>(`/employees/schedule-templates/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },

  applyScheduleTemplate: async (employeeId: string, templateId: string) => {
    const response = await api.post<{ success: boolean; data: any }>(
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
  avatarUrl?: string | null;
  createdAt: string;
  workMode?: string;
  specialty?: string;
  presence?: string | null;
  contactable?: boolean;
  contactScope?: string;
  contactAllowedIds?: string[];
  showInManagement?: boolean;
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
  orgRoleId?: string | null;
  orgRole?: { id: string; name: string; slug: string; color?: string | null } | null;
}

export interface UpdateMemberInput {
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
  /** Per-user Access Profile object, or a legacy module string[]. */
  enabledModules?: Record<string, unknown> | string[];
  contactable?: boolean;
  contactScope?: string;
  contactAllowedIds?: string[];
  showInManagement?: boolean;
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

  getMembers: async (params?: { search?: string; role?: string; page?: number; limit?: number }) => {
    const endpoint = buildUrlWithQuery('/organizations/members', {
      search: params?.search,
      role: params?.role !== 'all' ? params?.role : undefined,
      page: params?.page,
      limit: params?.limit,
    });
    const response = await api.get<{
      success: boolean;
      data: OrgMember[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>(endpoint);
    if (response.error) throw new Error(response.error);
    return response.data;
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
    const response = await api.get<{ success: boolean; data: any }>('/organizations/profile');
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  updateProfile: async (updates: Record<string, any>) => {
    const response = await api.patch<{ success: boolean; data: any }>('/organizations/profile', updates);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  updateNotificationPrefs: async (prefs: Record<string, any>) => {
    const response = await api.patch<{ success: boolean; data: any }>('/organizations/notification-prefs', prefs);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  updateSecuritySettings: async (settings: Record<string, any>) => {
    const response = await api.patch<{ success: boolean; data: any }>('/organizations/security-settings', settings);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  updateEnabledModules: async (enabledModules: string[]) => {
    const response = await api.patch<{ success: boolean; data: any }>('/organizations/profile', { enabledModules });
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
}

export interface UpdateLocationInput {
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  geofenceRadius?: number;
  timezone?: string;
  isActive?: boolean;
  enabledModules?: string[];
  workflowId?: string;
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
  list: async (params?: { page?: number; limit?: number; includeInactive?: boolean; search?: string }) => {
    const endpoint = buildUrlWithQuery('/locations', {
      page: params?.page,
      limit: params?.limit,
      includeInactive: params?.includeInactive,
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
    const response = await api.post<{ success: boolean; data: any }>(`/overtime/${id}/approve`, data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },

  reject: async (id: string, data: { reason: string }) => {
    const response = await api.post<{ success: boolean; data: any }>(`/overtime/${id}/reject`, data);
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
    const response = await api.get<{ success: boolean; data: { data: OvertimeRequest[]; meta: any } }>(endpoint);
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
  isDefault: boolean;
  isActive: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  statuses?: WorkflowStatus[];
}

export interface WorkflowStatus {
  id: string;
  workflowId: string;
  name: string;
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

export const workflowsApi = {
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

export const invoicesApi = {
  list: async (params?: { status?: string; page?: number; limit?: number }) => {
    const endpoint = buildUrlWithQuery('/invoices', params ?? {});
    const response = await api.get<any>(endpoint);
    if (response.error) throw new Error(response.error);
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get<any>(`/invoices/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },
  create: async (data: any) => {
    const response = await api.post<any>('/invoices', data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },
  update: async (id: string, data: any) => {
    const response = await api.patch<any>(`/invoices/${id}`, data);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },
  updateStatus: async (id: string, status: string) => {
    const response = await api.patch<any>(`/invoices/${id}/status`, { status });
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },
  delete: async (id: string) => {
    const response = await api.delete<any>(`/invoices/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },
  addItem: async (id: string, item: any) => {
    const response = await api.post<any>(`/invoices/${id}/items`, item);
    if (response.error) throw new Error(response.error);
    return response.data?.data;
  },
  removeItem: async (id: string, itemId: string) => {
    const response = await api.delete<any>(`/invoices/${id}/items/${itemId}`);
    if (response.error) throw new Error(response.error);
    return response.data;
  },
};

export default api;
export { TimeEntryStatus, BreakType, InvitationStatus, JoinRequestStatus, JoinPolicy } from '@hbcfield/shared/client';

// ──────────────────────────────────────────────────────────────────────────────
// Billing / Subscriptions
// ──────────────────────────────────────────────────────────────────────────────
import type { SubscriptionView, PlanTier, BillingInterval } from '@hbcfield/shared/client';

export const billingApi = {
  /** Current org subscription/billing status. */
  getSubscription: async (): Promise<SubscriptionView> => {
    const response = await api.get<SubscriptionView>('/billing/subscription');
    if (response.error) throw new Error(response.error);
    return response.data as SubscriptionView;
  },

  /** Start Stripe Checkout for a self-serve plan → returns a redirect URL. */
  checkout: async (tier: Exclude<PlanTier, 'enterprise'>, interval: BillingInterval): Promise<{ url: string }> => {
    const response = await api.post<{ url: string }>('/billing/checkout', { tier, interval });
    if (response.error) throw new Error(response.error);
    return response.data as { url: string };
  },

  /** Open the Stripe Customer Portal (payment method, invoices, cancel). */
  portal: async (): Promise<{ url: string }> => {
    const response = await api.post<{ url: string }>('/billing/portal', {});
    if (response.error) throw new Error(response.error);
    return response.data as { url: string };
  },

  /** Change the active plan/interval (returns a portal/checkout URL to confirm). */
  changePlan: async (tier: Exclude<PlanTier, 'enterprise'>, interval: BillingInterval): Promise<{ url?: string }> => {
    const response = await api.post<{ url?: string }>('/billing/change-plan', { tier, interval });
    if (response.error) throw new Error(response.error);
    return (response.data as { url?: string }) ?? {};
  },

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
  createdAt: string;
  updatedAt: string;
}

export type CustomerInput = Partial<Omit<Customer, "id" | "createdAt" | "updatedAt">>;

export const customersApi = {
  list: async (params?: { search?: string; status?: "active" | "inactive" | "all"; portalResident?: boolean; page?: number; limit?: number }) => {
    const qs = buildUrlWithQuery("/customers", params || {});
    const res = await api.get<{ data: Customer[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(qs);
    if (res.error) throw new Error(res.error);
    return res.data!;
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
  features: PortalFeatureFlags;
  categories: PortalIntakeCategory[];
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
  updatePortal: async (id: string, input: { name?: string; templateKey?: string; reseed?: boolean }) => {
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
  inviteResident: async (portalId: string, input: { name?: string; email?: string; unitName: string; unitAddress?: string }) => {
    const res = await api.post<{ customer: Customer; unit: PortalCustomerUnit; code?: string }>("/portal/admin/residents", { portalId, ...input });
    if (res.error) throw new Error(res.error);
    return res.data!;
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

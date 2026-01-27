/**
 * API Client for Doergo Backend
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
  buildUrlWithQuery,
} from '@doergo/shared';
import type {
  CompanyLocation,
  TimeEntry,
  Break,
  BreakStatus,
  BreakSummary as SharedBreakSummary,
  AttendanceSummary as SharedAttendanceSummary,
  AttendanceQueryParams as SharedAttendanceQueryParams,
  PaginatedResponse,
} from '@doergo/shared';

// Re-export shared types for convenience
export type {
  CompanyLocation,
  TimeEntry,
  Break,
  BreakStatus,
  PaginatedResponse,
};
export { TimeEntryStatus, BreakType };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  status: number;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// Token storage keys
const ACCESS_TOKEN_KEY = 'doergo_access_token';
const REFRESH_TOKEN_KEY = 'doergo_refresh_token';

// Token refresh state management - shared promise ensures only one refresh at a time
let refreshPromise: Promise<boolean> | null = null;

// Get tokens from storage
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

// Store tokens (always use localStorage for persistence)
export function setTokens(tokens: AuthTokens): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

// Clear tokens
export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// Check if we have tokens
export function hasTokens(): boolean {
  return !!getAccessToken() && !!getRefreshToken();
}

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
    console.log('[Auth] Refresh already in progress, waiting for existing request...');
    return refreshPromise;
  }

  const refreshToken = getRefreshToken();
  console.log('[Auth] Attempting token refresh, has refresh token:', !!refreshToken);

  if (!refreshToken) {
    console.log('[Auth] No refresh token available');
    return Promise.resolve(false);
  }

  // Create the promise IMMEDIATELY and store it
  // This ensures any concurrent calls will get the same promise
  refreshPromise = (async () => {
    try {
      console.log('[Auth] Sending refresh request to', `${API_BASE_URL}/auth/refresh`);
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      console.log('[Auth] Refresh response status:', response.status);
      const result = await response.json();
      console.log('[Auth] Refresh response:', result);

      // Check both HTTP status and response body for success
      if (!response.ok || !result.success) {
        console.log('[Auth] Refresh failed - clearing tokens');
        clearTokens();
        return false;
      }

      // API returns { success: true, data: { accessToken, refreshToken } }
      const data = result.data;
      if (!data?.accessToken || !data?.refreshToken) {
        console.log('[Auth] Refresh response missing tokens - clearing');
        clearTokens();
        return false;
      }

      console.log('[Auth] Refresh successful - storing new tokens');
      setTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });

      return true;
    } catch (error) {
      console.log('[Auth] Refresh error:', error);
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
    });

    // Handle 401 - Automatic token refresh
    if (response.status === 401 && retry) {
      console.log('[Auth] Got 401 on', endpoint, '- attempting refresh');

      // Check if we have a refresh token before attempting
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        console.log('[Auth] No refresh token - redirecting to login');
        // No refresh token - redirect to login
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return { status: 401, error: 'Session expired. Please log in again.' };
      }

      const refreshed = await refreshAccessToken();

      if (refreshed) {
        console.log('[Auth] Refresh successful - retrying original request');
        // Retry the original request with new token
        return apiRequest<T>(endpoint, options, false);
      }

      console.log('[Auth] Refresh failed - redirecting to login');
      // Refresh failed - redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
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

// Auth-specific API methods
export const authApi = {
  login: async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Login failed');
    }

    // API returns { success: true, data: { user, accessToken, refreshToken } }
    const data = result.data;

    setTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });

    return data;
  },

  logout: async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      await api.post('/auth/logout', { refreshToken }).catch(() => {});
    }
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
        // Permission fields
        platform: string;
        canCreateTasks: boolean;
        canViewAllTasks: boolean;
        canAssignTasks: boolean;
        canManageUsers: boolean;
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
    companyName: string;
  }) => {
    // Note: Role is NOT sent - backend always sets it to PARTNER for security
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
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
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
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
    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
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
};

// Task types
export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
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
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
  assignedTo?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
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
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  assetId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  assetId?: string | null;
}

export interface TasksQueryParams {
  status?: string;
  priority?: string;
  page?: number;
  limit?: number;
}

// Suggested technician response types
export interface SuggestedTechnician {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  specialty: string | null | undefined;
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

export interface SuggestedTechniciansResponse {
  taskId: string;
  technicians: SuggestedTechnician[];
  suggestedTechnicianId: string | null;
}

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
export const usersApi = {
  // Get all technicians (DISPATCHER only)
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

  // Assign a task to a technician (DISPATCHER only)
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

  // Get suggested technicians for a task (with scoring)
  getSuggestedTechnicians: async (taskId: string) => {
    const response = await api.get<{ success: boolean; data: SuggestedTechniciansResponse }>(
      `/tasks/${taskId}/suggested-technicians`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    return response.data?.data;
  },
};

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

// ============================================
// ATTENDANCE TYPES & API
// ============================================
// Core attendance types imported from @doergo/shared (see imports at top)

// Re-export isBreakActive from shared
export { isBreakActive } from '@doergo/shared';

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
  page?: number;
  limit?: number;
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
  // Get time entries for a specific location
  getLocationEntries: async (locationId: string, params?: AttendanceQueryParams) => {
    const endpoint = buildUrlWithQuery(`/attendance/locations/${locationId}/entries`, {
      date: params?.date,
      page: params?.page,
      limit: params?.limit,
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

export default api;

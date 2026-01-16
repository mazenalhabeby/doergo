/**
 * API Client for Doergo Backend
 *
 * Handles all HTTP communication with the API gateway.
 * Implements standard OAuth 2.0 token refresh with:
 * - Automatic 401 handling with token refresh and request retry
 * - Request queue to prevent multiple concurrent refresh attempts
 * - Proactive refresh before token expiry
 */

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
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
}

export interface TasksQueryParams {
  status?: string;
  priority?: string;
  page?: number;
  limit?: number;
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

export const tasksApi = {
  // Get all tasks with optional filters
  list: async (params?: TasksQueryParams) => {
    const searchParams = new URLSearchParams();
    if (params?.status && params.status !== 'all') {
      searchParams.set('status', params.status);
    }
    if (params?.priority && params.priority !== 'all') {
      searchParams.set('priority', params.priority);
    }
    if (params?.page) {
      searchParams.set('page', String(params.page));
    }
    if (params?.limit) {
      searchParams.set('limit', String(params.limit));
    }

    const queryString = searchParams.toString();
    const endpoint = `/tasks${queryString ? `?${queryString}` : ''}`;

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
};

export default api;

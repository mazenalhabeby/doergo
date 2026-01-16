import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// Token storage keys
const ACCESS_TOKEN_KEY = 'doergo_access_token';
const REFRESH_TOKEN_KEY = 'doergo_refresh_token';

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
  statusCode?: number;
  error?: string;
}

interface LoginResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'CLIENT' | 'DISPATCHER' | 'TECHNICIAN';
    organizationId: string;
  };
  accessToken: string;
  refreshToken: string;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'CLIENT' | 'DISPATCHER' | 'TECHNICIAN';
  organizationId: string;
}

class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }
}

// Token refresh state - shared promise prevents concurrent refreshes
let refreshPromise: Promise<string | null> | null = null;

// Callback to notify auth context of logout
let onAuthFailure: (() => void) | null = null;

export function setAuthFailureCallback(callback: () => void) {
  onAuthFailure = callback;
}

/**
 * Get access token from SecureStore
 */
async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

/**
 * Get refresh token from SecureStore
 */
async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

/**
 * Save tokens to SecureStore
 */
async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
  ]);
}

/**
 * Clear tokens from SecureStore
 */
async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

/**
 * Refresh access token with queue management
 * Uses a shared promise to ensure only one refresh request is made at a time
 * Backend handles grace period for concurrent requests using the same token
 */
function refreshAccessToken(): Promise<string | null> {
  // If a refresh is already in progress, wait for it
  if (refreshPromise) {
    console.log('[Auth] Refresh already in progress, waiting...');
    return refreshPromise;
  }

  // Create the promise IMMEDIATELY (synchronously) before any await
  refreshPromise = (async () => {
    try {
      const storedRefreshToken = await getRefreshToken();
      console.log('[Auth] Attempting refresh, has token:', !!storedRefreshToken);
      console.log('[Auth] Sending refresh token (first 20 chars):', storedRefreshToken?.substring(0, 20));

      if (!storedRefreshToken) {
        return null;
      }

      console.log('[Auth] Sending refresh request to:', `${API_URL}/auth/refresh`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });

      clearTimeout(timeoutId);

      const result = await response.json() as ApiResponse<RefreshResponse>;
      console.log('[Auth] Refresh response status:', response.status);

      if (!response.ok || !result.success) {
        console.log('[Auth] Refresh failed!');
        console.log('[Auth] Response status:', response.status);
        console.log('[Auth] Response body:', JSON.stringify(result));
        await clearTokens();
        return null;
      }

      const data = result.data;
      if (!data?.accessToken || !data?.refreshToken) {
        console.log('[Auth] Refresh response missing tokens');
        await clearTokens();
        return null;
      }

      console.log('[Auth] Refresh successful, saving new tokens');
      console.log('[Auth] New refresh token (first 20 chars):', data.refreshToken.substring(0, 20));
      await saveTokens(data.accessToken, data.refreshToken);

      // Verify tokens were saved
      const verifyRefresh = await getRefreshToken();
      console.log('[Auth] Verified saved refresh token (first 20 chars):', verifyRefresh?.substring(0, 20));

      return data.accessToken;
    } catch (error) {
      console.error('[Auth] Refresh error:', error);
      await clearTokens();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Base fetch function without auth
 */
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    const data = await response.json() as ApiResponse<T>;

    if (!response.ok) {
      throw new ApiError(
        data.message || 'An error occurred',
        response.status
      );
    }

    return (data.data ?? data) as T;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timed out. Please check your connection.', 408);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Unable to connect to server. Please check if the API is running.', 0);
  }
}

/**
 * Authenticated fetch with automatic 401 handling and retry
 * This is the main function for making authenticated API calls
 */
async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const accessToken = await getAccessToken();
  const url = `${API_URL}${endpoint}`;
  console.log(`[Auth] fetchWithAuth ${endpoint} retry=${retry} hasToken=${!!accessToken}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    // Handle 401 - Automatic token refresh and retry
    if (response.status === 401 && retry) {
      console.log('[Auth] Got 401 on', endpoint, '- attempting refresh');
      const newToken = await refreshAccessToken();
      console.log('[Auth] refreshAccessToken returned:', !!newToken);

      if (newToken) {
        // Verify token is in storage before retry
        const storedToken = await getAccessToken();
        console.log('[Auth] Token in storage before retry:', !!storedToken);
        console.log('[Auth] Retrying', endpoint, 'with new token');
        return fetchWithAuth<T>(endpoint, options, false);
      }

      // Refresh failed - notify auth context which will redirect to login
      console.log('[Auth] Refresh failed for', endpoint, '- triggering logout');
      if (onAuthFailure) {
        onAuthFailure();
      }
      // Throw error so the calling code knows the request failed
      // The UI should handle this gracefully (app will redirect to login)
      throw new ApiError('Session expired', 401);
    }

    const data = await response.json() as ApiResponse<T>;

    if (!response.ok) {
      throw new ApiError(
        data.message || 'An error occurred',
        response.status
      );
    }

    return (data.data ?? data) as T;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timed out. Please check your connection.', 408);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Unable to connect to server. Please check if the API is running.', 0);
  }
}

// Task types
export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'DRAFT' | 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'CANCELED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  organizationId: string;
  createdById: string;
  assignedToId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  assignedTo?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface TasksResponse {
  data: Task[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
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

// Auth API (no auth required for these)
export const authApi = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const result = await fetchApi<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    // Save tokens after successful login
    await saveTokens(result.accessToken, result.refreshToken);
    return result;
  },

  refresh: async (): Promise<string | null> => {
    return refreshAccessToken();
  },

  logout: async (): Promise<void> => {
    try {
      const [accessToken, refreshToken] = await Promise.all([
        getAccessToken(),
        getRefreshToken(),
      ]);

      if (accessToken && refreshToken) {
        await fetchWithAuth('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        }, false); // Don't retry on 401 during logout
      }
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      await clearTokens();
    }
  },

  getMe: async (): Promise<User> => {
    return fetchWithAuth<User>('/auth/me', { method: 'GET' });
  },
};

// Tasks API - all use authenticated fetch with automatic 401 handling
export const tasksApi = {
  // Get tasks assigned to current user (for technicians)
  list: async (): Promise<Task[]> => {
    return fetchWithAuth<Task[]>('/tasks', { method: 'GET' });
  },

  // Get single task by ID
  getById: async (id: string): Promise<Task> => {
    return fetchWithAuth<Task>(`/tasks/${id}`, { method: 'GET' });
  },

  // Update task status (start, block, complete)
  updateStatus: async (id: string, status: string, reason?: string): Promise<Task> => {
    return fetchWithAuth<Task>(`/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    });
  },

  // Get task comments
  getComments: async (taskId: string): Promise<Comment[]> => {
    return fetchWithAuth<Comment[]>(`/tasks/${taskId}/comments`, { method: 'GET' });
  },

  // Add comment to task
  addComment: async (taskId: string, content: string): Promise<Comment> => {
    return fetchWithAuth<Comment>(`/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },
};

// Export utilities for auth context
export {
  ApiError,
  getAccessToken,
  getRefreshToken,
  saveTokens,
  clearTokens,
  refreshAccessToken,
};
export type { LoginResponse, RefreshResponse, User };

import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import {
  TechnicianType,
  TimeEntryStatus,
  BreakType,
  Role,
  Platform,
  TaskStatus,
  TaskPriority,
  buildUrlWithQuery,
} from '@doergo/shared';
import type {
  CompanyLocation,
  TimeEntry,
  AttendanceStatus,
  Break,
  BreakStatus,
  ClockInInput,
  ClockOutInput,
  AttendanceHistoryParams,
  PaginatedResponse,
} from '@doergo/shared';

// Re-export types for convenience
export type {
  CompanyLocation,
  TimeEntry,
  AttendanceStatus,
  Break,
  BreakStatus,
  ClockInInput,
  ClockOutInput,
  AttendanceHistoryParams,
  PaginatedResponse,
};
export { TechnicianType, TimeEntryStatus, BreakType };

// Dynamically get API URL based on Expo dev server host
function getApiUrl(): string {
  // If explicitly set in env (non-empty), use that for production
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim().length > 0) {
    console.log('[API] Using env URL:', envUrl);
    return envUrl;
  }

  // In development, get host from Expo's dev server
  const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;
  console.log('[API] Expo debuggerHost:', debuggerHost);

  if (debuggerHost) {
    // debuggerHost is like "192.168.178.26:8081" - extract IP and use API port 4000
    const host = debuggerHost.split(':')[0];
    const url = `http://${host}:4000/api/v1`;
    console.log('[API] Using dynamic URL:', url);
    return url;
  }

  // Fallback for simulator/emulator
  console.log('[API] Using fallback localhost');
  return 'http://localhost:4000/api/v1';
}

const API_URL = getApiUrl();

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
    role: 'ADMIN' | 'CLIENT' | 'DISPATCHER' | 'TECHNICIAN';
    organizationId: string;
    // Permission fields
    platform: 'WEB' | 'MOBILE' | 'BOTH';
    canCreateTasks: boolean;
    canViewAllTasks: boolean;
    canAssignTasks: boolean;
    canManageUsers: boolean;
    // Technician-specific fields
    technicianType?: TechnicianType;
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
  role: 'ADMIN' | 'CLIENT' | 'DISPATCHER' | 'TECHNICIAN';
  organizationId: string;
  // Permission fields
  platform: 'WEB' | 'MOBILE' | 'BOTH';
  canCreateTasks: boolean;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  // Technician-specific fields
  technicianType?: TechnicianType;
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

// Task types (using shared TaskStatus enum)
export { TaskStatus };

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
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

  // Decline task assignment (technician rejects the job)
  declineTask: async (taskId: string): Promise<void> => {
    return fetchWithAuth<void>(`/tasks/${taskId}/decline`, {
      method: 'POST',
    });
  },
};

// Location tracking types
export interface LocationUpdate {
  lat: number;
  lng: number;
  accuracy?: number;
  taskId?: string;
}

export interface LocationResponse {
  lat: number;
  lng: number;
  accuracy?: number;
  updatedAt: string;
}

// Tracking API - for technician location updates
export const trackingApi = {
  // Update technician's current location
  updateLocation: async (data: LocationUpdate): Promise<LocationResponse> => {
    return fetchWithAuth<LocationResponse>('/tracking/location', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Service Report types
export interface PartUsedInput {
  name: string;
  partNumber?: string;
  quantity: number;
  unitCost?: number;
  notes?: string;
}

export interface CompleteTaskInput {
  summary: string;
  workPerformed?: string;
  workDuration: number; // in seconds
  technicianSignature?: string;
  customerSignature?: string;
  customerName?: string;
  partsUsed?: PartUsedInput[];
}

export interface ServiceReport {
  id: string;
  taskId: string;
  summary: string;
  workPerformed?: string;
  workDuration: number;
  technicianSignature?: string;
  customerSignature?: string;
  customerName?: string;
  completedAt: string;
  completedById: string;
}

// Reports API - for completing tasks with service reports
export const reportsApi = {
  // Complete a task with a service report
  completeTask: async (taskId: string, input: CompleteTaskInput): Promise<ServiceReport> => {
    return fetchWithAuth<ServiceReport>(`/tasks/${taskId}/complete`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};

// Attendance API - for clock-in/clock-out (using shared types from @doergo/shared)
export const attendanceApi = {
  // Get current attendance status (is clocked in?, assigned locations)
  getStatus: async (): Promise<AttendanceStatus> => {
    return fetchWithAuth<AttendanceStatus>('/attendance/status', { method: 'GET' });
  },

  // Clock in at a location
  clockIn: async (input: ClockInInput): Promise<TimeEntry> => {
    return fetchWithAuth<TimeEntry>('/attendance/clock-in', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  // Clock out
  clockOut: async (input: ClockOutInput): Promise<TimeEntry> => {
    return fetchWithAuth<TimeEntry>('/attendance/clock-out', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  // Get attendance history
  getHistory: async (params?: AttendanceHistoryParams): Promise<PaginatedResponse<TimeEntry>> => {
    const endpoint = buildUrlWithQuery('/attendance/history', params ?? {});
    return fetchWithAuth<PaginatedResponse<TimeEntry>>(endpoint, { method: 'GET' });
  },

  // Start a break
  startBreak: async (type?: BreakType, notes?: string): Promise<Break> => {
    const endpoint = buildUrlWithQuery('/attendance/breaks/start', { type });
    return fetchWithAuth<Break>(endpoint, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  },

  // End a break
  endBreak: async (notes?: string): Promise<Break> => {
    return fetchWithAuth<Break>('/attendance/breaks/end', {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  },

  // Get current break status
  getBreakStatus: async (): Promise<BreakStatus> => {
    return fetchWithAuth<BreakStatus>('/attendance/breaks/status', { method: 'GET' });
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

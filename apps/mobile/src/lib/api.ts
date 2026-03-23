import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import {
  TechnicianType,
  WorkMode,
  TimeEntryStatus,
  BreakType,
  Role,
  Platform,
  TaskStatus,
  TaskPriority,
  buildUrlWithQuery,
} from '@doergo/shared/client';
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
  InvitationValidation,
  AcceptInvitationInput,
  TechnicianListItem,
  TechniciansListResponse,
} from '@doergo/shared/client';

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
  TechnicianListItem,
  TechniciansListResponse,
};
export { TechnicianType, WorkMode, TimeEntryStatus, BreakType };

// Dynamically get API URL based on Expo dev server host
function getApiUrl(): string {
  // If explicitly set in env (non-empty), use that for production
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl;
  }

  // In development, get host from Expo's dev server
  const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;

  if (debuggerHost) {
    // debuggerHost is like "192.168.178.26:8081" - extract IP and use API port 4000
    const host = debuggerHost.split(':')[0];
    const url = `http://${host}:4000/api/v1`;
    return url;
  }

  // Fallback for simulator/emulator
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
  user: User;
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
  organizationId: string | null;
  onboardingCompleted: boolean;
  // Permission fields
  platform: 'WEB' | 'MOBILE' | 'BOTH';
  canCreateTasks: boolean;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  // Technician-specific fields
  technicianType?: TechnicianType;
  workMode?: WorkMode;
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
    return refreshPromise;
  }

  // Create the promise IMMEDIATELY (synchronously) before any await
  refreshPromise = (async () => {
    try {
      const storedRefreshToken = await getRefreshToken();

      if (!storedRefreshToken) {
        return null;
      }

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

      if (!response.ok || !result.success) {
        await clearTokens();
        return null;
      }

      const data = result.data;
      if (!data?.accessToken || !data?.refreshToken) {
        await clearTokens();
        return null;
      }

      await saveTokens(data.accessToken, data.refreshToken);

      return data.accessToken;
    } catch (error) {
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
      const newToken = await refreshAccessToken();

      if (newToken) {
        return fetchWithAuth<T>(endpoint, options, false);
      }

      // Refresh failed - notify auth context which will redirect to login
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

// Task input types
export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string;
  locationAddress?: string;
  assignedToId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string;
  locationAddress?: string;
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

  register: async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    companyName?: string;
  }): Promise<void> => {
    // Register the user - response contains user data but we don't need it
    // because we'll call login() separately after registration
    await fetchApi('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
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
    } catch {
      // Ignore logout errors - tokens will be cleared regardless
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

  // Create a new task (ADMIN)
  create: async (input: CreateTaskInput): Promise<Task> => {
    return fetchWithAuth<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  // Update task details (ADMIN)
  update: async (id: string, input: UpdateTaskInput): Promise<Task> => {
    return fetchWithAuth<Task>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  // Assign technician to task (ADMIN)
  assign: async (taskId: string, workerId: string): Promise<Task> => {
    return fetchWithAuth<Task>(`/tasks/${taskId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ workerId }),
    });
  },

  // Delete task (ADMIN)
  delete: async (id: string): Promise<void> => {
    return fetchWithAuth<void>(`/tasks/${id}`, {
      method: 'DELETE',
    });
  },
};

// Technicians API - for admin/dispatcher to list and view technicians
export const techniciansApi = {
  // List technicians with optional filters
  list: async (params?: { search?: string; status?: string; page?: number; limit?: number }): Promise<TechniciansListResponse> => {
    const endpoint = buildUrlWithQuery('/technicians', params ?? {});
    return fetchWithAuth<TechniciansListResponse>(endpoint, { method: 'GET' });
  },

  // Get technician by ID
  getById: async (id: string): Promise<TechnicianListItem> => {
    return fetchWithAuth<TechnicianListItem>(`/technicians/${id}`, { method: 'GET' });
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

// Push Token API - for registering and removing push notification tokens
export interface RegisterPushTokenInput {
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId?: string;
}

export const pushApi = {
  // Register a push notification token
  registerToken: async (input: RegisterPushTokenInput): Promise<{ success: boolean }> => {
    return fetchWithAuth<{ success: boolean }>('/users/push-token', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  // Remove a push notification token
  removeToken: async (token: string): Promise<{ success: boolean }> => {
    return fetchWithAuth<{ success: boolean }>(`/users/push-token/${encodeURIComponent(token)}`, {
      method: 'DELETE',
    });
  },
};

// Onboarding API - for post-registration onboarding flow
export const onboardingApi = {
  // Get onboarding status
  getStatus: async (): Promise<{ needsOnboarding: boolean; hasPendingJoinRequest: boolean; pendingRequest: any }> => {
    return fetchWithAuth<{ needsOnboarding: boolean; hasPendingJoinRequest: boolean; pendingRequest: any }>('/onboarding/status');
  },

  // Path A: Create organization
  createOrganization: async (data: { name: string; address?: string; industry?: string }): Promise<{ organization: { id: string; name: string }; joinCode: string; user: User }> => {
    return fetchWithAuth<any>('/onboarding/create-org', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Path B: Validate org code
  validateOrgCode: async (code: string): Promise<{ valid: boolean; organizationName?: string; joinPolicy?: string; message?: string }> => {
    return fetchWithAuth<any>(`/onboarding/validate-org-code/${encodeURIComponent(code)}`);
  },

  // Path B: Submit join request
  submitJoinRequest: async (data: { orgCode: string; message?: string }): Promise<any> => {
    return fetchWithAuth<any>('/onboarding/join-by-code', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Path C: Accept invitation as existing user
  acceptInvitation: async (code: string): Promise<{ user: User }> => {
    return fetchWithAuth<{ user: User }>('/onboarding/accept-invitation', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  // Cancel join request
  cancelJoinRequest: async (id: string): Promise<any> => {
    return fetchWithAuth<any>(`/onboarding/join-requests/${id}`, {
      method: 'DELETE',
    });
  },
};

// Get current user profile (for refreshUser)
export const userApi = {
  me: async (): Promise<User> => {
    return fetchWithAuth<User>('/auth/me');
  },
};

// Invitations API - for invite code registration flow (public endpoints)
export const invitationsApi = {
  // Validate an invitation code
  validate: async (code: string): Promise<InvitationValidation> => {
    return fetchApi<InvitationValidation>(`/invitations/validate/${encodeURIComponent(code)}`);
  },

  // Accept an invitation and create account
  accept: async (input: AcceptInvitationInput): Promise<LoginResponse> => {
    return fetchApi<LoginResponse>('/invitations/accept', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};

// Time-Off types
export interface TimeOffRequest {
  id: string;
  technicianId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  approvedById?: string;
  approvedBy?: { id: string; firstName: string; lastName: string };
  approvedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

// Time-Off API
export const timeOffApi = {
  list: async (technicianId: string, status?: string): Promise<TimeOffRequest[]> => {
    const endpoint = buildUrlWithQuery(`/technicians/${technicianId}/time-off`, { status });
    return fetchWithAuth<TimeOffRequest[]>(endpoint, { method: 'GET' });
  },

  request: async (technicianId: string, data: { startDate: string; endDate: string; reason?: string }): Promise<TimeOffRequest> => {
    return fetchWithAuth<TimeOffRequest>(`/technicians/${technicianId}/time-off`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  cancel: async (timeOffId: string): Promise<void> => {
    return fetchWithAuth<void>(`/technicians/time-off/${timeOffId}`, {
      method: 'DELETE',
    });
  },
};

// Report Attachments API
export const reportAttachmentsApi = {
  getPresignedUrl: async (reportId: string, fileName: string, fileType: string): Promise<{ uploadUrl: string; fileKey: string; fileUrl: string; expiresIn: number }> => {
    return fetchWithAuth(`/reports/${reportId}/attachments/presign`, {
      method: 'POST',
      body: JSON.stringify({ fileName, fileType }),
    });
  },

  confirmUpload: async (reportId: string, data: { type: string; fileName: string; fileUrl: string; fileSize: number; caption?: string }): Promise<any> => {
    return fetchWithAuth(`/reports/${reportId}/attachments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  delete: async (reportId: string, attachmentId: string): Promise<void> => {
    return fetchWithAuth<void>(`/reports/${reportId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    });
  },
};

// Upload file to presigned URL with progress tracking
export function uploadToPresignedUrl(
  url: string,
  fileUri: string,
  contentType: string,
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
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.send({ uri: fileUri, type: contentType, name: 'upload' } as any);
  });
}

// Auth API - change password
export const passwordApi = {
  changePassword: async (data: { currentPassword: string; newPassword: string }): Promise<void> => {
    return fetchWithAuth<void>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
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
export type { LoginResponse, RefreshResponse, User, InvitationValidation, AcceptInvitationInput };

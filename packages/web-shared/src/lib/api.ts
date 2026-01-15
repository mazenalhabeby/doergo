/**
 * API Client for Doergo Backend
 *
 * Handles all HTTP communication with the API gateway.
 * Includes automatic token refresh and error handling.
 */

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
const REMEMBER_ME_KEY = 'doergo_remember_me';

// Get API base URL from environment
function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  // Check for Next.js public env var
  return (window as unknown as { ENV?: { NEXT_PUBLIC_API_URL?: string } }).ENV?.NEXT_PUBLIC_API_URL
    || process.env.NEXT_PUBLIC_API_URL
    || 'http://localhost:4000';
}

// Get tokens from storage
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY) || sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY) || sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

// Store tokens
export function setTokens(tokens: AuthTokens, rememberMe = true): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(REMEMBER_ME_KEY, String(rememberMe));

  // Clear from both storages first
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);

  // Store in appropriate storage
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

// Clear tokens
export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(REMEMBER_ME_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

// Check if we have tokens
export function hasTokens(): boolean {
  return !!getAccessToken() && !!getRefreshToken();
}

// Get remember me preference
function getRememberMe(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(REMEMBER_ME_KEY) !== 'false';
}

// Refresh access token using refresh token
async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearTokens();
      return false;
    }

    const result = await response.json();
    const data = result.data;
    setTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    }, getRememberMe());
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

// Generic API request function
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
    const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle 401 - try to refresh token
    if (response.status === 401 && retry) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return apiRequest<T>(endpoint, options, false);
      }
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return { status: 401, error: 'Session expired' };
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
  login: async (email: string, password: string, rememberMe = true) => {
    const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Login failed');
    }

    const data = result.data;

    setTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    }, rememberMe);

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

    return response.data?.data;
  },

  register: async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    companyName: string;
  }) => {
    const response = await fetch(`${getApiBaseUrl()}/auth/register`, {
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
};

export default api;

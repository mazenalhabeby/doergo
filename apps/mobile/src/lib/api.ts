const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

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

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  // Add timeout to prevent infinite loading
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

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

    // API returns {success: true, data: {...}}, extract the data
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

export const authApi = {
  login: async (email: string, password: string, rememberMe = false): Promise<LoginResponse> => {
    return fetchApi<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, rememberMe }),
    });
  },

  refresh: async (refreshToken: string): Promise<RefreshResponse> => {
    return fetchApi<RefreshResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  },

  logout: async (accessToken: string, refreshToken: string): Promise<void> => {
    await fetchApi('/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ refreshToken }),
    });
  },

  getMe: async (accessToken: string): Promise<{ user: User }> => {
    return fetchApi<{ user: User }>('/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
};

export { ApiError };
export type { LoginResponse, RefreshResponse, User };

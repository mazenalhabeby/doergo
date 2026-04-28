import { fetchApi, fetchWithAuth, saveTokens, clearTokens, getAccessToken, getRefreshToken } from './client';
import type { User, LoginResponse } from './types';

// Auth API (login/register use fetchApi - no auth required)
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
    const { refreshAccessToken } = await import('./client');
    return refreshAccessToken();
  },

  register: async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    companyName?: string;
  }): Promise<void> => {
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

// User API - for refreshing current user profile
export const userApi = {
  me: async (): Promise<User> => {
    return fetchWithAuth<User>('/auth/me');
  },
};

// Password API
export const passwordApi = {
  changePassword: async (data: { currentPassword: string; newPassword: string }): Promise<void> => {
    return fetchWithAuth<void>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  forgotPassword: async (email: string): Promise<void> => {
    return fetchApi<void>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
};

// Account API
export const accountApi = {
  deleteAccount: async (password: string): Promise<void> => {
    return fetchWithAuth<void>('/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
  },
};

// Avatar API - profile picture upload
export const avatarApi = {
  getPresignedUrl: async (fileName: string, fileType: string): Promise<{ uploadUrl: string; fileUrl: string; expiresIn: number }> => {
    return fetchWithAuth('/users/avatar/presign', {
      method: 'POST',
      body: JSON.stringify({ fileName, fileType }),
    });
  },

  confirm: async (avatarUrl: string): Promise<any> => {
    return fetchWithAuth('/users/avatar', {
      method: 'POST',
      body: JSON.stringify({ avatarUrl }),
    });
  },

  remove: async (): Promise<any> => {
    return fetchWithAuth('/users/avatar', {
      method: 'DELETE',
    });
  },
};

import { fetchApi, fetchWithAuth, saveTokens, clearTokens, getAccessToken, getRefreshToken, getApiUrl } from './client';
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

// Avatar API - profile picture upload (local file storage)
export const avatarApi = {
  upload: async (uri: string, fileName: string, fileType: string): Promise<{ avatarUrl: string }> => {
    const token = await getAccessToken();
    const formData = new FormData();
    formData.append('file', {
      uri,
      name: fileName,
      type: fileType,
    } as any);

    const apiUrl = getApiUrl();
    const response = await fetch(`${apiUrl}/users/avatar/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.message || 'Upload failed');
    }

    const data = await response.json();
    return data.data;
  },

  remove: async (): Promise<any> => {
    return fetchWithAuth('/users/avatar', {
      method: 'DELETE',
    });
  },
};

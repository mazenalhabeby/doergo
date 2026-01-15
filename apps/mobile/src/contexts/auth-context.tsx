import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authApi, type User, type LoginResponse, ApiError } from '../lib/api';

const ACCESS_TOKEN_KEY = 'doergo_access_token';
const REFRESH_TOKEN_KEY = 'doergo_refresh_token';
const USER_KEY = 'doergo_user';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Load stored auth state on mount
  useEffect(() => {
    loadStoredAuth();
  }, []);

  // Set up token refresh interval
  useEffect(() => {
    if (!accessToken) return;

    // Refresh token every 10 minutes (access token expires in 15m)
    const interval = setInterval(async () => {
      await refreshAccessToken();
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [accessToken]);

  const loadStoredAuth = async () => {
    try {
      const [storedAccessToken, storedRefreshToken, storedUser] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);

      if (storedAccessToken && storedRefreshToken && storedUser) {
        // Verify token is still valid by refreshing
        try {
          const response = await authApi.refresh(storedRefreshToken);
          await saveTokens(response.accessToken, response.refreshToken);
          setAccessToken(response.accessToken);
          setUser(JSON.parse(storedUser));
        } catch {
          // Token invalid, clear storage
          await clearStorage();
        }
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
      await clearStorage();
    } finally {
      setIsLoading(false);
    }
  };

  const saveTokens = async (newAccessToken: string, newRefreshToken: string) => {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, newAccessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, newRefreshToken),
    ]);
  };

  const saveUser = async (userData: User) => {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));
  };

  const clearStorage = async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
    setAccessToken(null);
    setUser(null);
  };

  const refreshAccessToken = async (): Promise<string | null> => {
    try {
      const storedRefreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (!storedRefreshToken) return null;

      const response = await authApi.refresh(storedRefreshToken);
      await saveTokens(response.accessToken, response.refreshToken);
      setAccessToken(response.accessToken);
      return response.accessToken;
    } catch (error) {
      console.error('Error refreshing token:', error);
      await clearStorage();
      return null;
    }
  };

  const login = async (email: string, password: string, rememberMe = false) => {
    const response = await authApi.login(email, password, rememberMe);

    // Only allow TECHNICIAN role on mobile
    if (response.user.role !== 'TECHNICIAN') {
      throw new ApiError('Access denied. This app is for technicians only.', 403);
    }

    await saveTokens(response.accessToken, response.refreshToken);
    await saveUser(response.user);
    setAccessToken(response.accessToken);
    setUser(response.user);
  };

  const logout = async () => {
    try {
      const storedRefreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (accessToken && storedRefreshToken) {
        await authApi.logout(accessToken, storedRefreshToken);
      }
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      await clearStorage();
    }
  };

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (accessToken) return accessToken;
    return refreshAccessToken();
  }, [accessToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

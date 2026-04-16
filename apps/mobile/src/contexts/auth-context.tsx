import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  authApi,
  userApi,
  setAuthFailureCallback,
  setUserRefreshedCallback,
  getAccessToken as getStoredAccessToken,
  clearTokens,
  type User,
  type LoginResponse,
  ApiError,
} from '../lib/api';

const USER_KEY = 'hbcfield_user';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Handle auth failure (called by api.ts when refresh fails)
  const handleAuthFailure = useCallback(async () => {
    console.log('[AuthContext] Auth failure - clearing user state');
    await SecureStore.deleteItemAsync(USER_KEY);
    setUser(null);
  }, []);

  // Handle user data from token refresh (eliminates /auth/me call)
  const handleUserRefreshed = useCallback(async (userData: User) => {
    console.log('[AuthContext] User data refreshed from token refresh');
    setUser(userData);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));
  }, []);

  // Set up callbacks
  useEffect(() => {
    setAuthFailureCallback(handleAuthFailure);
    setUserRefreshedCallback(handleUserRefreshed);
  }, [handleAuthFailure, handleUserRefreshed]);

  // Load stored auth state on mount
  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const [storedAccessToken, storedUser] = await Promise.all([
        getStoredAccessToken(),
        SecureStore.getItemAsync(USER_KEY),
      ]);

      if (storedAccessToken && storedUser) {
        // We have tokens - trust them and let API handle refresh on-demand
        // This avoids race conditions where eager refresh uses the token
        // before user requests can use it
        console.log('[AuthContext] Found stored tokens, restoring session');
        setUser(JSON.parse(storedUser));
      } else {
        console.log('[AuthContext] No stored session found');
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
      await clearStorage();
    } finally {
      setIsLoading(false);
    }
  };

  const saveUser = async (userData: User) => {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));
  };

  const clearStorage = async () => {
    await Promise.all([
      clearTokens(),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
    setUser(null);
  };

  const login = async (email: string, password: string) => {
    // authApi.login saves tokens internally
    const response = await authApi.login(email, password);

    // Platform-based access check (replaces TECHNICIAN-only check)
    // Any role with platform=MOBILE or platform=BOTH can access mobile app
    const userPlatform = response.user.platform;
    if (userPlatform !== 'MOBILE' && userPlatform !== 'BOTH') {
      await clearTokens();
      throw new ApiError('Access denied. Your account cannot access the mobile app.', 403);
    }

    await saveUser(response.user);
    setUser(response.user);
  };

  const refreshUser = async () => {
    try {
      const updatedUser = await userApi.me();
      await saveUser(updatedUser);
      setUser(updatedUser);
      console.log('[AuthContext] User refreshed, onboardingCompleted:', updatedUser.onboardingCompleted);
    } catch (error) {
      console.error('[AuthContext] Error refreshing user:', error);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      await clearStorage();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        needsOnboarding: !!user && !user.onboardingCompleted,
        login,
        logout,
        refreshUser,
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

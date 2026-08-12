import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getAccessPlatforms } from '@hbcfield/shared/client';
import {
  authApi,
  userApi,
  setAuthFailureCallback,
  setUserRefreshedCallback,
  getAccessToken as getStoredAccessToken,
  clearTokens,
  type User,
  type LoginResponse,
} from '../lib/api';
import { stopRouteTracking } from '../services/background-route-tracking';
import { stopBackgroundHeartbeat } from '../services/background-heartbeat';
import { stopGeofence } from '../services/background-geofence';
import { purgePushTokenRegistration } from '../hooks/usePushNotifications';

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

  const refreshUser = useCallback(async () => {
    try {
      const updatedUser = await userApi.me();
      await saveUser(updatedUser);
      setUser(updatedUser);
      console.log('[AuthContext] User refreshed, onboardingCompleted:', updatedUser.onboardingCompleted);
    } catch (error) {
      console.error('[AuthContext] Error refreshing user:', error);
    }
  }, []);

  // Load stored auth state on mount
  useEffect(() => {
    loadStoredAuth();
  }, []);

  // Reconcile the Access Profile when the app returns to the foreground, so a
  // change an admin made on the web (enabledModules/platform/scope) takes effect
  // without needing a cold restart. Only fires on background→active transitions
  // while authenticated.
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isAuthedRef = useRef(false);
  isAuthedRef.current = !!user;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (next === 'active' && prev.match(/inactive|background/) && isAuthedRef.current) {
        void refreshUser();
      }
    });
    return () => sub.remove();
  }, [refreshUser]);

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
        // Reconcile in the background: an admin may have changed this user's
        // Access Profile (enabledModules/platform/scope) on the web while they
        // were logged in here. Pull the latest /auth/me so tab/module visibility
        // reflects server state on every app launch — not just after re-login.
        void refreshUser();
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
    // Stop any background location work FIRST so the OS foreground-service
    // notification and GPS subscription are torn down immediately — otherwise
    // a distance-based tracker can linger until the device next moves.
    await Promise.all([
      stopRouteTracking().catch(() => undefined),
      stopBackgroundHeartbeat().catch(() => undefined),
      stopGeofence().catch(() => undefined),
      // Unregister this device's push token while the session token is still
      // valid, so a shared device stops receiving the previous user's push. (H11.)
      purgePushTokenRegistration().catch(() => undefined),
    ]);
    await Promise.all([
      clearTokens(),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
    setUser(null);
  };

  const login = async (email: string, password: string) => {
    // authApi.login saves tokens internally
    const response = await authApi.login(email, password);

    // Platform hard-block: a web-only Access Profile may not use the mobile app.
    // (Per-feature access within mobile is still gated by enabledModules/hasModule.)
    if (getAccessPlatforms(response.user) === 'web') {
      await clearStorage();
      throw new Error('This account is restricted to the web app. Please sign in at the web portal.');
    }

    await saveUser(response.user);
    setUser(response.user);
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

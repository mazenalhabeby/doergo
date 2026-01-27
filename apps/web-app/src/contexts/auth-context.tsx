'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { authApi, hasTokens, clearTokens, refreshTokens, getAccessToken, getRefreshToken } from '@/lib/api';
import { DashboardSkeleton } from '@/components/skeletons';

// User type
export interface User {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  organizationId?: string;
  // Permission fields
  platform: string;
  canCreateTasks: boolean;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
}

// Token info type
export interface TokenInfo {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExp: Date | null;
  refreshTokenExp: Date | null;
}

// Parse JWT to get expiry
function parseJwt(token: string): { exp?: number } | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

// Check if token will expire within the given seconds
function isTokenExpiringSoon(token: string | null, withinSeconds: number): boolean {
  if (!token) return true;
  const payload = parseJwt(token);
  if (!payload?.exp) return true;
  const expiresAt = payload.exp * 1000;
  const now = Date.now();
  return expiresAt - now < withinSeconds * 1000;
}

// Auth context type
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  tokenInfo: TokenInfo;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  manualRefresh: () => Promise<boolean>;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider props
interface AuthProviderProps {
  children: ReactNode;
}

// Auth provider component
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo>({
    accessToken: null,
    refreshToken: null,
    accessTokenExp: null,
    refreshTokenExp: null,
  });

  // Update token info from storage
  const updateTokenInfo = useCallback(() => {
    const accessToken = getAccessToken();
    const refreshToken = getRefreshToken();

    let accessTokenExp: Date | null = null;
    let refreshTokenExp: Date | null = null;

    if (accessToken) {
      const payload = parseJwt(accessToken);
      if (payload?.exp) {
        accessTokenExp = new Date(payload.exp * 1000);
      }
    }

    if (refreshToken) {
      const payload = parseJwt(refreshToken);
      if (payload?.exp) {
        refreshTokenExp = new Date(payload.exp * 1000);
      }
    }

    setTokenInfo({
      accessToken,
      refreshToken,
      accessTokenExp,
      refreshTokenExp,
    });
  }, []);

  // Check authentication status on mount
  const checkAuth = useCallback(async () => {
    if (!hasTokens()) {
      setIsLoading(false);
      return;
    }

    try {
      const userData = await authApi.getMe();
      if (userData) {
        setUser(userData);
        updateTokenInfo();
      }
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [updateTokenInfo]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Update token info every second (for countdown display)
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      updateTokenInfo();
    }, 1000);

    return () => clearInterval(interval);
  }, [user, updateTokenInfo]);

  // Token refresh is handled by the 401 handler in api.ts
  // When an API call gets 401, it automatically refreshes tokens and retries
  // No proactive refresh - simpler and more reliable

  // Login function
  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    setUser(response.user);
    updateTokenInfo();
  }, [updateTokenInfo]);

  // Logout function
  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setTokenInfo({
      accessToken: null,
      refreshToken: null,
      accessTokenExp: null,
      refreshTokenExp: null,
    });
  }, []);

  // Refresh user data
  const refreshUser = useCallback(async () => {
    try {
      const userData = await authApi.getMe();
      if (userData) {
        setUser(userData);
      }
    } catch {
      // Ignore errors
    }
  }, []);

  // Manual refresh function
  const manualRefresh = useCallback(async () => {
    try {
      const success = await refreshTokens();
      if (success) {
        updateTokenInfo();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [updateTokenInfo]);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    tokenInfo,
    login,
    logout,
    refreshUser,
    manualRefresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// HOC for protected routes
export function withAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  allowedRoles?: string[]
) {
  return function WithAuthComponent(props: P) {
    const { user, isLoading, isAuthenticated } = useAuth();

    useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        window.location.href = '/login';
      }

      if (!isLoading && isAuthenticated && allowedRoles && user) {
        if (!allowedRoles.includes(user.role)) {
          window.location.href = '/unauthorized';
        }
      }
    }, [isLoading, isAuthenticated, user]);

    if (isLoading) {
      return <DashboardSkeleton />;
    }

    if (!isAuthenticated) {
      return null;
    }

    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
      return null;
    }

    return <WrappedComponent {...props} />;
  };
}

export default AuthContext;

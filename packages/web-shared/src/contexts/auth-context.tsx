'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { authApi, hasTokens, clearTokens } from '../lib/api';

// User type
export interface User {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

// Auth context type
export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider props
export interface AuthProviderProps {
  children: ReactNode;
}

// Auth provider component
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
      }
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Login function
  const login = useCallback(async (email: string, password: string, rememberMe = true) => {
    const response = await authApi.login(email, password, rememberMe);
    setUser(response.user);
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
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

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser,
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

export default AuthContext;

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getAccessPlatforms } from '@hbcfield/shared/client';
import {
  authApi,
  userApi,
  setAuthFailureCallback,
  setUserRefreshedCallback,
  getAccessToken as getStoredAccessToken,
  type User
} from '../lib/api';
import { endSession, type SessionEndReason } from '../lib/session/end-session';
import { loadStoredUser, saveStoredUser } from '../lib/session/stored-user';

/** How a sign-out was asked for — see `endSession`. */
export interface LogoutOptions {
  /** Default `signed-out`. `account-deleted` also forgets this phone's Face ID key and always erases local data. */
  reason?: Extract<SessionEndReason, 'signed-out' | 'account-deleted'>;
  /** Keep a member's unsent work on the phone (default true). False only after the member chose to discard it. */
  keepUnsent?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  login: (email: string, password: string) => Promise<void>;
  /**
   * Every sign-out goes through `endSession` — see there for what it clears.
   * A plain sign-out keeps the phone's fingerprint binding; only
   * `reason: 'account-deleted'` forgets it.
   */
  logout: (opts?: LogoutOptions) => Promise<void>;
  /** Set by an explicit sign-out; the login screen must not auto-prompt then. */
  signedOutByUser: boolean;
  refreshUser: () => Promise<void>;
  /** Show a change the member made at once, before the server has it (a queued profile change). */
  patchUser: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [signedOutByUser, setSignedOutByUser] = useState(false);

  /*
    The server refused the session (the client calls this only for a 400/401/403
    from /auth/refresh — never for no signal). It used to delete ONE key and
    leave everything else of the member's on the phone for whoever came next.
    Unsent work is kept: the member signs back in and it is sent.
  */
  const handleAuthFailure = useCallback(async () => {
    console.log('[AuthContext] Session refused by the server - ending it');
    await endSession({ reason: 'expired', keepUnsent: true });
    setUser(null);
  }, []);

  // Handle user data from token refresh (eliminates /auth/me call)
  /*
    A token refresh returns a NARROWER user than login does.

    `/auth/login` and `/auth/me` both project the resolved access set onto the
    user — `access` plus every derived `can…` field. `/auth/refresh` does not:
    it reads the stored token's user row directly and carries only the columns
    that live on it, because widening that query would put two extra joins on
    the hottest path in the API.

    So this MERGES rather than replaces. Replacing silently dropped every
    permission field the refresh payload happens not to mention, roughly fifteen
    minutes into any session — latent until now only because the three flags
    mobile reads today are all columns that survive the trip.
  */
  const handleUserRefreshed = useCallback(async (userData: User) => {
    console.log('[AuthContext] User data refreshed from token refresh');
    setUser((prev) => {
      const merged = prev ? { ...prev, ...userData } : userData;
      // Fire-and-forget: persistence must not block the render, and a failed
      // write only costs a re-fetch on next launch.
      void saveStoredUser(merged).catch(() => undefined);
      return merged;
    });
  }, []);

  // Set up callbacks
  useEffect(() => {
    setAuthFailureCallback(handleAuthFailure);
    setUserRefreshedCallback(handleUserRefreshed);
  }, [handleAuthFailure, handleUserRefreshed]);

  const patchUser = useCallback((patch: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const merged = { ...prev, ...patch };
      void saveStoredUser(merged).catch(() => undefined);
      return merged;
    });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const updatedUser = await userApi.me();
      await saveStoredUser(updatedUser);
      setUser(updatedUser);
      console.log('[AuthContext] User refreshed, onboardingCompleted:', updatedUser.onboardingCompleted);
    } catch (error) {
      // No signal is expected, not an error: the kept user stands until it comes back.
      console.warn('[AuthContext] Could not refresh the user:', error instanceof Error ? error.message : error);
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
        loadStoredUser(),
      ]);

      if (storedAccessToken && storedUser) {
        // We have tokens - trust them and let API handle refresh on-demand
        // This avoids race conditions where eager refresh uses the token
        // before user requests can use it
        console.log('[AuthContext] Found stored tokens, restoring session');
        setUser(storedUser);
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
      await endSession({ reason: 'expired', keepUnsent: true });
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    // authApi.login saves tokens internally
    const response = await authApi.login(email, password);

    // Platform hard-block: a web-only Access Profile may not use the mobile app.
    // (Per-feature access within mobile is still gated by enabledModules/hasModule.)
    if (getAccessPlatforms(response.user) === 'web') {
      await endSession({ reason: 'refused-platform', userId: response.user.id });
      throw new Error('This account is restricted to the web app. Please sign in at the web portal.');
    }

    await saveStoredUser(response.user);
    setSignedOutByUser(false);
    setUser(response.user);
  };

  /*
    ⚠️ THE ONE SIGN-OUT. Profile, the onboarding pass, the customer portal and
    account deletion all call this, and this calls `endSession` — so what is
    cleared cannot depend on which button somebody happened to press.

    The device key STAYS on an ordinary sign-out. It used to go too, which made
    the feature unusable: the fingerprint button only exists on the login
    screen, the login screen is reached by signing out, and signing out
    destroyed the key. "Member B unlocks as member A" is handled where it
    belongs — the key records its OWNER, the login screen says whose account it
    opens, and the server revokes A's key the moment B enrols. Only the account
    going away forgets it.
  */
  const logout = async (opts?: LogoutOptions) => {
    try {
      await endSession({ reason: opts?.reason ?? 'signed-out', keepUnsent: opts?.keepUnsent ?? true, userId: user?.id });
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      setSignedOutByUser(true);
      setUser(null);
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
        signedOutByUser,
        refreshUser,
        patchUser,
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

'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, hasTokens, clearTokens, refreshTokens, getAccessToken } from '@/lib/api';
import { hasFeatureModule, orgHasAddOn, isAddOn } from '@hbcfield/shared/client';
import { DashboardSkeleton } from '@/components/skeletons';

// User type
export interface User {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  organizationId?: string;
  organizationName?: string;
  /** IANA timezone of the org — the default display zone for all times on the
   *  client (attendance times override per-entry with the location's zone). */
  organizationTimezone?: string | null;
  /** Org opted into the in-house vs external field-worker distinction — gates the
   *  employment-type UI + the €9 in-house seat. */
  orgUsesExternalWorkers?: boolean;
  /** False for a freshly-registered "orphan" user who must complete onboarding. */
  onboardingCompleted?: boolean;
  // Permission fields
  canCreateTasks: boolean;
  taskCreationScope: string;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  canViewReports?: boolean;
  // Capabilities split out of canManageUsers / canViewAllTasks. Optional: a token
  // minted before the split carries the old shape, and the server-side bridge
  // grants these to anyone who held the flag they came from.
  canManageWorkspaces?: boolean;
  canManageRota?: boolean;
  canManageInvoices?: boolean;
  canManageAssets?: boolean;
  allowRemote?: boolean;
  presence?: "AVAILABLE" | "BUSY" | "AWAY" | null;
  // Per-user clock display preference ("12h" | "24h"); display-only.
  timeFormat?: "12h" | "24h";
  // One-time welcome-tour flag: false → auto-run the welcome guide once.
  guidesSeen?: boolean;
  // Access Profile (mobile tabs / web screens) — array or object form.
  enabledModules: string[] | Record<string, unknown>;
  // Org FEATURE modules (sprints, checklists, tracking…) — drives hasModule().
  orgModules?: string[];
  // Billing tier + subscription status (lowercase) — drives hasPlanFeature().
  planTier?: string | null; // LEGACY — nothing reads it to decide access
  orgAddOns?: string[] | null;
  subStatus?: string;
  // Avatar
  avatarUrl?: string | null;
  // Unified resolved access (Phase 2): org-wide ∪ per-space permission grants.
  access?: {
    org?: Record<string, boolean>;
    perSpace?: Record<string, Record<string, boolean>>;
    // ACTIVE cross-org shared spaces this user can open (guest side). Populated
    // by the backend on /auth/me so the guest UI needs no extra fetch.
    sharedSpaces?: SharedSpaceAccess[];
  };
}

/** An ACTIVE space shared with the current org, as surfaced in the auth context. */
export interface SharedSpaceAccess {
  spaceId: string;
  ownerOrgId: string;
  ownerOrgName: string;
  spaceName: string;
  level: 'VIEW' | 'CONTRIBUTE' | 'CONTROL';
  showWorkers: boolean;
  showAttendance: boolean;
  showTracking: boolean;
  showReports: boolean;
  allowRequests: boolean;
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
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Optimistically merge fields into the local user (e.g. presence) without a round-trip. */
  patchUser: (partial: Partial<User>) => void;
  manualRefresh: () => Promise<boolean>;
  /** Check if an organization module is enabled */
  hasModule: (module: string) => boolean;
  /** Check if the org's billing tier is entitled to a premium feature/capability */
  hasPlanFeature: (feature: string) => boolean;
  /** Check if the user has a specific permission (checks user fields + role permissions) */
  hasPermission: (perm: string) => boolean;
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
  const queryClient = useQueryClient();

  // Update token info from storage. The refresh token now lives only in an
  // httpOnly cookie and is not readable from JS, so it isn't surfaced here.
  const updateTokenInfo = useCallback(() => {
    const accessToken = getAccessToken();

    let accessTokenExp: Date | null = null;
    if (accessToken) {
      const payload = parseJwt(accessToken);
      if (payload?.exp) {
        accessTokenExp = new Date(payload.exp * 1000);
      }
    }

    setTokenInfo({
      accessToken,
      refreshToken: null,
      accessTokenExp,
      refreshTokenExp: null,
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
        setUser({
          ...userData,
          taskCreationScope: userData.taskCreationScope || (userData.role === 'ADMIN' ? 'ORG' : userData.canViewAllTasks ? 'SPACE' : 'NONE'),
          canCreateTasks: userData.role === 'ADMIN' || userData.canViewAllTasks || (userData.taskCreationScope || 'NONE') !== 'NONE',
          avatarUrl: userData.avatarUrl || null,
          enabledModules: userData.enabledModules || [],
          orgModules: userData.orgModules || [],
        });
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

  // Update token info when user changes
  useEffect(() => {
    if (user) updateTokenInfo();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Proactive token refresh — refresh access token before it expires
  // This avoids the 401 → refresh → retry cycle (3 requests instead of 1)
  useEffect(() => {
    if (!user) return;

    const checkAndRefresh = async () => {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      // Refresh when access token will expire within 2 minutes
      if (isTokenExpiringSoon(accessToken, 120)) {
        const success = await refreshTokens();
        if (success) {
          updateTokenInfo();
        } else {
          // Refresh token also expired — session is dead
          clearTokens();
          setUser(null);
        }
      }
    };

    // Check every 30 seconds (not every second — lightweight)
    const interval = setInterval(checkAndRefresh, 30_000);

    // Also check immediately on mount
    checkAndRefresh();

    return () => clearInterval(interval);
  }, [user, updateTokenInfo]);

  // Login function
  const login = useCallback(async (email: string, password: string, rememberMe = false) => {
    // Clear all cached data from previous session before setting new user
    queryClient.clear();
    const response = await authApi.login(email, password, rememberMe);
    const u = response.user;
    setUser({
      ...u,
      taskCreationScope: u.taskCreationScope || (u.role === 'ADMIN' ? 'ORG' : u.canViewAllTasks ? 'SPACE' : 'NONE'),
      canCreateTasks: u.role === 'ADMIN' || u.canViewAllTasks || (u.taskCreationScope || 'NONE') !== 'NONE',
      avatarUrl: u.avatarUrl || null,
      enabledModules: u.enabledModules || [],
      orgModules: u.orgModules || [],
    });
    updateTokenInfo();
  }, [updateTokenInfo, queryClient]);

  // Logout function
  const logout = useCallback(async () => {
    await authApi.logout();
    // Clear all cached data so next login doesn't show stale data
    queryClient.clear();
    setUser(null);
    setTokenInfo({
      accessToken: null,
      refreshToken: null,
      accessTokenExp: null,
      refreshTokenExp: null,
    });
  }, [queryClient]);

  // Refresh user data
  const refreshUser = useCallback(async () => {
    try {
      const userData = await authApi.getMe();
      if (userData) {
        setUser({
          ...userData,
          taskCreationScope: userData.taskCreationScope || (userData.role === 'ADMIN' ? 'ORG' : userData.canViewAllTasks ? 'SPACE' : 'NONE'),
          canCreateTasks: userData.role === 'ADMIN' || userData.canViewAllTasks || (userData.taskCreationScope || 'NONE') !== 'NONE',
          avatarUrl: userData.avatarUrl || null,
          enabledModules: userData.enabledModules || [],
          orgModules: userData.orgModules || [],
        });
      }
    } catch {
      // Ignore errors
    }
  }, []);

  // Optimistic local patch — lets UI (e.g. the presence ring) reflect a change
  // instantly, before the server round-trip / refreshUser confirms it.
  const patchUser = useCallback((partial: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  // Reconcile the session when the tab regains focus or periodically, so an
  // access-profile change an admin makes takes effect without a re-login. The
  // gateway purges the member's auth cache on update, so /auth/me returns fresh.
  const isAuthedRef = useRef(false);
  isAuthedRef.current = !!user;
  useEffect(() => {
    let lastRefresh = Date.now();
    // Debounced: only re-fetch /auth/me if it's been >60s since the last one, so
    // rapid focus/visibility events don't hammer the gateway. The interval is a
    // slow safety net (access changes also propagate on the gateway's auth cache).
    const refreshIfAuthed = () => {
      if (!isAuthedRef.current || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefresh < 60_000) return;
      lastRefresh = Date.now();
      void refreshUser();
    };
    window.addEventListener('focus', refreshIfAuthed);
    document.addEventListener('visibilitychange', refreshIfAuthed);
    const id = window.setInterval(refreshIfAuthed, 300_000);
    return () => {
      window.removeEventListener('focus', refreshIfAuthed);
      document.removeEventListener('visibilitychange', refreshIfAuthed);
      window.clearInterval(id);
    };
  }, [refreshUser]);

  // Check if a FEATURE module (sprints, checklists, tracking…) is enabled.
  // Resolves from the org's feature modules (orgModules) for ALL users —
  // never from the per-user access profile, so org settings apply to everyone.
  const hasModule = useCallback((module: string) => {
    return hasFeatureModule(user ?? {}, module);
  }, [user?.orgModules]);

  // Check if the org's billing tier is entitled to a premium feature/capability
  // (recurring, overtime, workflows, custom_fields, dependencies, …). Pure tier
  // check — no API call. Used to gate premium nav items and pages.
  const hasPlanFeature = useCallback((feature: string) => {
    // What the organization BOUGHT, not what a tier allowed. Fails closed on a
    // key that is neither a module nor an add-on, matching PlanGuard — the UI
    // hiding something the API would 402 is far better than the reverse.
    if (!isAddOn(feature)) return false;
    return orgHasAddOn(user?.orgAddOns ?? null, feature);
  }, [user?.orgAddOns]);

  // Check if user has a specific permission
  const hasPermission = useCallback((perm: string) => {
    if (!user) return false;
    // Satisfied by EITHER a direct user flag or the unified org access (a
    // superset of the flags — never narrower).
    // The permission flags are named columns on the user; indexing by a
    // runtime string needs the record view of it, not a hole in the type.
    if ((user as unknown as Record<string, unknown>)[perm] === true) return true;
    return user.access?.org?.[perm] === true;
  }, [user]);

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
    patchUser,
    manualRefresh,
    hasModule,
    hasPlanFeature,
    hasPermission,
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

import { ApiError, TRANSPORT_CODES, authEndpoints, isApiError } from '@hbcfield/shared/client';
import { authHttp, call, type ApiResponse } from '../http-client';
import { clearSession, setAccessToken } from '../auth-session';
import { apiError, localizeApiError } from '../server-error';

/** Forget the session in this tab and every other one. */
function clearTokens(): void {
  clearSession();
}

/**
 * Sign-in, register and the password reset go through `authHttp`: no bearer
 * token, no refresh, no retries (a 429 there is the account lockout). A refusal
 * rejects with its ApiError — code included, so a lockout or a suspended
 * organization can be said in the reader's language; the fallback sentence is
 * the one the screen always showed.
 */
async function signInCall<T>(run: () => Promise<T>, fallback: string): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (isApiError(e)) {
      if (e.kind === 'timeout') {
        throw new ApiError(
          'Request timed out. Please check your connection and try again.',
          { status: 0, kind: 'timeout', code: TRANSPORT_CODES.timeout });
      }
      if (e.kind === 'network') {
        throw new ApiError(
          'Unable to connect to server. Please check if the API is running.',
          { status: 0, kind: 'network', code: TRANSPORT_CODES.network });
      }
      if (e.kind === 'http') return Promise.reject(
        localizeApiError(e.message ? e : new ApiError(fallback, { status: e.status, kind: 'http' })));
    }
    throw e;
  }
}

interface MeData {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  organizationId?: string;
  organizationTimezone?: string | null;
  onboardingCompleted?: boolean;
  avatarUrl?: string | null;
  // Permission fields
  canCreateTasks: boolean;
  taskCreationScope?: string;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  enabledModules?: string[] | Record<string, unknown>;
  orgModules?: string[];
  /** Modules on in workspaces this member can see — see auth.service. */
  spaceModules?: string[];
}

// Auth-specific API methods
export const authApi = {
  login: async (email: string, password: string, rememberMe = false) => {
    // API returns { success: true, data: { user, accessToken } }. The refresh
    // token is ONLY in the httpOnly cookie the gateway sets — the gateway strips
    // it from a browser's JSON so no script on the page can ever read it.
    const data = (await signInCall(
      () =>
        authHttp.call(authEndpoints.login, undefined, {
          // client:'web' → session length honors rememberMe (24h default / 30d).
          body: { email, password, rememberMe, client: 'web' },
        }),
      'Login failed',
    )) as unknown as { accessToken?: string; user: Record<string, unknown> } | null;

    if (!data?.accessToken) {
      throw new Error('Invalid server response');
    }

    setAccessToken(data.accessToken);

    return data;
  },

  logout: async () => {
    // The refresh token is in the httpOnly cookie; the gateway reads it from the
    // cookie (credentials are sent) and clears it server-side.
    await call(authEndpoints.logout, undefined, { body: {} });
    clearTokens();
  },

  getMe: async () => {
    const response = await call(authEndpoints.me) as ApiResponse<{ success: boolean; data: MeData }>;

    if (response.error) {
      throw apiError(response);
    }

    // API returns { success: true, data: { user info } }
    return response.data?.data;
  },

  register: async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    // Optional: when omitted the backend creates an "orphan" user (no org) that
    // must complete onboarding (create org / join by code / accept invitation).
    companyName?: string;
    firstSpaceName?: string;
  }) => {
    // Note: Role is NOT sent - backend always sets it to ADMIN for security
    return signInCall(() => authHttp.call(authEndpoints.register, undefined, { body: data, unwrap: 'raw' }), 'Registration failed');
  },

  forgotPassword: async (email: string) => {
    return signInCall(
      () => authHttp.call(authEndpoints.forgotPassword, undefined, { body: { email }, unwrap: 'raw' }),
      'Failed to send reset email');
  },

  resetPassword: async (token: string, newPassword: string) => {
    return signInCall(
      () => authHttp.call(authEndpoints.resetPassword, undefined, { body: { token, newPassword }, unwrap: 'raw' }),
      'Failed to reset password',
    );
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await call(authEndpoints.changePassword, undefined, {
      body: { currentPassword, newPassword },
    }) as ApiResponse<{ success: boolean; message: string }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },
};

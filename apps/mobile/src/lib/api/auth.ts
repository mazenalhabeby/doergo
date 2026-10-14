import { forgetPushToken, storedPushToken } from '../push-token-store';
import { call, E, saveTokens, clearTokens, getAccessToken, getRefreshToken } from './client';
import type { User, LoginResponse } from './types';

// Auth API (login/register/forgot-password are public endpoints - no token, no refresh)
export const authApi = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    // client:'mobile' → 90-day rotating session (app users stay signed in).
    const result: LoginResponse = await call(E.auth.login, undefined, { body: { email, password, client: 'mobile' } });

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
    await call(E.auth.register, undefined, { body: data });
  },

  logout: async (): Promise<void> => {
    try {
      const [accessToken, refreshToken, pushToken] = await Promise.all([
        getAccessToken(),
        getRefreshToken(),
        storedPushToken(),
      ]);

      if (accessToken && refreshToken) {
        /*
          The push registration goes WITH the sign-out.

          It used to be removed by a separate `DELETE /users/push-token/:token`
          issued afterwards, once the session had already been torn down — best
          effort, and one failure (no signal at the moment of signing out, the
          app killed mid-logout) left the row on the server forever, because
          the phone clears its cached token either way and can never name it
          again. The member kept getting their own notifications on a phone
          they had signed out of.

          This request is authenticated by definition at the moment it runs, so
          it is the one place the removal cannot arrive too late. The server
          scopes the delete to this member AND this token — signing out of one
          phone never silences another.
        */
        // No refresh on a 401 during logout — the session is ending either way.
        await call(E.auth.logout, undefined, { body: { refreshToken, pushToken }, refreshOn401: false });
        // Told, and confirmed: only now is it safe to forget.
        await forgetPushToken();
      }
    } catch {
      // Ignore logout errors - tokens will be cleared regardless
    } finally {
      await clearTokens();
    }
  },

  getMe: async (): Promise<User> => {
    return call(E.auth.me);
  },
};

// User API - for refreshing current user profile
export const userApi = {
  me: async (): Promise<User> => {
    return call(E.auth.me);
  },
  // Set the manual availability override (AVAILABLE | BUSY | AWAY, or null = auto).
  setPresence: async (presence: 'AVAILABLE' | 'BUSY' | 'AWAY' | null): Promise<void> => {
    return call(E.users.updateMe, undefined, { body: { presence } });
  },
  // Set the per-user clock display preference ("12h" | "24h"); display-only.
  setTimeFormat: async (timeFormat: '12h' | '24h'): Promise<void> => {
    return call(E.users.updateMe, undefined, { body: { timeFormat } });
  },
  // Several workspaces: clock in where they stand ('AUTO') or always choose ('ASK').
  setClockInPick: async (clockInPick: 'AUTO' | 'ASK'): Promise<void> => {
    return call(E.users.updateMe, undefined, { body: { clockInPick } });
  },
  // The language the server writes this member's notifications in. Pushes are
  // composed on the server while the app is closed, so the choice has to live
  // there as well as on the phone.
  setLocale: async (locale: string): Promise<void> => {
    return call(E.users.updateMe, undefined, { body: { locale } });
  },
  // Your own notification switches on the server, and which member emails the
  // organization allows at all (the ceiling — notifications/email-prefs in shared).
  getNotificationPrefs: async (): Promise<{ prefs: Record<string, boolean>; organizationAllows: Record<string, boolean> }> => {
    return call(E.notifications.prefs);
  },
  // Merge-update your own switches: only the keys given change.
  updateNotificationPrefs: async (prefs: Record<string, boolean>): Promise<Record<string, boolean>> => {
    return call(E.notifications.updatePrefs, undefined, { body: { prefs } });
  },
  // Update your own name (any authenticated user, incl. portal clients).
  updateProfile: async (data: { firstName: string; lastName: string }): Promise<void> => {
    return call(E.users.updateMe, undefined, { body: data });
  },
};

// Password API
export const passwordApi = {
  changePassword: async (data: { currentPassword: string; newPassword: string }): Promise<void> => {
    return call(E.auth.changePassword, undefined, { body: data });
  },

  forgotPassword: async (email: string): Promise<void> => {
    return call(E.auth.forgotPassword, undefined, { body: { email } });
  },
};

// Account API
export const accountApi = {
  deleteAccount: async (password: string): Promise<void> => {
    return call(E.auth.deleteAccount, undefined, { body: { password } });
  },
};

// Avatar API - profile picture upload (local file storage)
export const avatarApi = {
  upload: async (uri: string, fileName: string, fileType: string): Promise<{ avatarUrl: string }> => {
    const formData = new FormData();
    formData.append('file', {
      uri,
      name: fileName,
      type: fileType,
    } as any);
    // Multipart through the client: the token, a 401 → refresh, the long upload timeout, never retried.
    return call(E.users.uploadAvatar, undefined, { body: formData });
  },

  remove: async (): Promise<any> => {
    return call(E.users.removeAvatar);
  },
};

/** Message contracts for auth-service `auth` handlers (types only — the wire is the cmd string). */
import { rpc } from '../contract';
import type { CurrentUserData } from '../../decorators';

import type { AuthServiceReply } from './auth-service-replies';

/** What the gateway reads of a sign-in or a refresh: the cookie's token and who signed in. */
export type SessionReply = AuthServiceReply<{
  refreshToken?: string;
  user?: { id?: string; organizationId?: string | null; presence?: string | null };
}>;

/** What the gateway reads of a validated access token (JwtAuthGuard). */
export interface ValidateTokenReply {
  valid: boolean;
  user?: CurrentUserData;
}

export const authHealth = rpc<Record<string, never>>('auth_health');
export const register = rpc<{
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  companyName?: string;
  firstSpaceName?: string;
}>('register');
export const login = rpc<
  {
    email: string;
    password: string;
    rememberMe?: boolean;
    client?: string;
    clientPlatform?: string;
    userAgent?: string;
    ipAddress?: string;
  },
  SessionReply
>('login');
export const refresh = rpc<{ refreshToken: string }, SessionReply>('refresh');
export const logout = rpc<
  { refreshToken: string; pushToken?: string },
  { userId?: string; organizationId?: string | null }
>('logout');
export const forgotPassword = rpc<{ email: string }>('forgot_password');
export const resetPassword = rpc<{ token: string; newPassword: string }, { userId?: string; [key: string]: unknown }>(
  'reset_password',
);
export const validateToken = rpc<{ token: string }, ValidateTokenReply>('validate_token');
export const changePassword = rpc<{ userId: string; currentPassword: string; newPassword: string }, AuthServiceReply>(
  'change_password',
);
export const updateAvatar = rpc<{ userId: string; avatarUrl: string }>('update_avatar');
export const removeAvatar = rpc<{ userId: string }>('remove_avatar');
export const listSessions = rpc<{ userId: string }>('list_sessions');
export const revokeSession = rpc<{ userId: string; sessionId: string }>('revoke_session');
export const revokeAllSessions = rpc<{ userId: string; exceptSessionId?: string; currentRefreshToken?: string }>(
  'revoke_all_sessions',
);
export const deleteAccount = rpc<{ userId: string; password: string }, AuthServiceReply>('delete_account');
export const platformMailStatus = rpc<Record<string, never>>('platform_mail_status');
export const biometricEnroll = rpc<{
  userId: string;
  deviceId: string;
  publicKey: string;
  label: string;
  platform: string;
  secureHardware?: boolean;
}>('biometric_enroll');
export const biometricChallenge = rpc<{ deviceId: string }>('biometric_challenge');
export const biometricVerify = rpc<{ deviceId: string; signature: string; userAgent?: string; ipAddress?: string }>(
  'biometric_verify',
);
export const biometricDevices = rpc<{ userId: string }>('biometric_devices');
export const biometricRevoke = rpc<{ userId: string; deviceId: string }>('biometric_revoke');

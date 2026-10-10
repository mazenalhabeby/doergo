/**
 * The session and the member's own account, plus the cross-cutting services
 * both apps call: billing status, routes, geocoding, offline sync and GPS.
 * Gateway: modules/auth, users, billing, routes, geo, sync, tracking.
 */
import type { User } from '../../types';
import type { RouteOptimizeRequest, OptimizedRoute } from '../../types';
import type { SubscriptionView } from '../../billing/types';
import type { OrgCostBreakdown } from '../../billing/module-pricing';
import type { SyncMediaLink, SyncPullResponse, SyncPullScope, SyncPushResponse } from '../../sync/protocol';
import { defineEndpoints, endpoint } from '../core/define';
import { path, withQuery } from '../core/path';

type Id = { id: string };

export interface LoginBody {
  email: string;
  password: string;
  /** 'mobile' → 90-day rotating session; 'web' → honours rememberMe. */
  client?: 'web' | 'mobile';
  rememberMe?: boolean;
}

export interface SessionTokens {
  accessToken: string;
  /** Absent for a browser: the refresh token lives only in the httpOnly cookie. */
  refreshToken?: string;
  user?: User;
}

/**
 * Sign-in and the session. ⚠️ `refresh` is called by each app's own refresh
 * function (the core's `config.refresh`), never through `call` with auth on —
 * a refresh must not itself trigger a refresh.
 */
export const authEndpoints = defineEndpoints('auth', {
  login: endpoint<void, SessionTokens & { user: User }, LoginBody>({ method: 'POST', path: () => '/auth/login', public: true }),
  register: endpoint<void, unknown, { email: string; password: string; firstName: string; lastName: string; companyName?: string }>({
    method: 'POST',
    path: () => '/auth/register',
    public: true,
  }),
  refresh: endpoint<void, SessionTokens, { refreshToken?: string }>({ method: 'POST', path: () => '/auth/refresh', public: true }),
  /** The push registration goes WITH the sign-out (scoped to this member and this token). */
  logout: endpoint<void, unknown, { refreshToken?: string; pushToken?: string | null }>({ method: 'POST', path: () => '/auth/logout' }),
  me: endpoint<void, User>({ method: 'GET', path: () => '/auth/me', keep: false }),
  forgotPassword: endpoint<void, void, { email: string }>({ method: 'POST', path: () => '/auth/forgot-password', public: true }),
  resetPassword: endpoint<void, void, { token: string; newPassword: string }>({ method: 'POST', path: () => '/auth/reset-password', public: true }),
  changePassword: endpoint<void, void, { currentPassword: string; newPassword: string }>({ method: 'POST', path: () => '/auth/change-password' }),
  deleteAccount: endpoint<void, void, { password: string }>({ method: 'DELETE', path: () => '/auth/account' }),
  sessions: endpoint<void, unknown[]>({ method: 'GET', path: () => '/auth/sessions' }),
  revokeSession: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/auth/sessions/${a.id}` }),
  revokeAllSessions: endpoint<void, void>({ method: 'DELETE', path: () => '/auth/sessions' }),
  devices: endpoint<void, unknown[]>({ method: 'GET', path: () => '/auth/devices' }),
  removeDevice: endpoint<{ deviceId: string }, void>({ method: 'DELETE', path: (a) => path`/auth/devices/${a.deviceId}` }),
  biometricEnroll: endpoint<void, unknown, Record<string, unknown>>({ method: 'POST', path: () => '/auth/biometric/enroll' }),
  biometricChallenge: endpoint<void, unknown, Record<string, unknown>>({ method: 'POST', path: () => '/auth/biometric/challenge', public: true }),
  biometricVerify: endpoint<void, SessionTokens, Record<string, unknown>>({ method: 'POST', path: () => '/auth/biometric/verify', public: true }),
});

export const usersEndpoints = defineEndpoints('users', {
  me: endpoint<void, User>({ method: 'GET', path: () => '/users/me', keep: true }),
  /** Your own profile, presence, time format, language. */
  updateMe: endpoint<void, unknown, Record<string, unknown>>({ method: 'PATCH', path: () => '/users/me' }),
  updateEmail: endpoint<void, unknown, { email: string; password?: string }>({ method: 'PATCH', path: () => '/users/me/email' }),
  get: endpoint<Id, User>({ method: 'GET', path: (a) => path`/users/${a.id}` }),
  workers: endpoint<void, User[]>({ method: 'GET', path: () => '/users/workers' }),
  /** Multipart: `file`. */
  uploadAvatar: endpoint<void, { avatarUrl: string }, unknown>({ method: 'POST', path: () => '/users/avatar/upload', upload: true }),
  removeAvatar: endpoint<void, unknown>({ method: 'DELETE', path: () => '/users/avatar' }),
  registerPushToken: endpoint<void, { success: boolean }, { token: string; platform: 'ios' | 'android' | 'web'; deviceId?: string; locale?: string }>({
    method: 'POST',
    path: () => '/users/push-token',
  }),
  /** ⚠️ The token is a path SEGMENT — encoded like every other value. */
  removePushToken: endpoint<{ token: string }, { success: boolean }>({ method: 'DELETE', path: (a) => path`/users/push-token/${a.token}` }),
});

/** Read-only billing both apps show; changing it (add-ons, checkout, portal) is web-only. */
export const billingEndpoints = defineEndpoints('billing', {
  subscription: endpoint<void, SubscriptionView>({ method: 'GET', path: () => '/billing/subscription', keep: false }),
  bill: endpoint<void, OrgCostBreakdown>({ method: 'GET', path: () => '/billing/bill', keep: false }),
});

export const routesEndpoints = defineEndpoints('routes', {
  /** Multi-stop optimizer: order + road geometry (Google → OSRM → nearest-neighbour). Billed per request. */
  optimize: endpoint<void, OptimizedRoute, RouteOptimizeRequest>({ method: 'POST', path: () => '/routes/optimize' }),
});

/**
 * The geocoding proxy. Still @Public on the gateway for old phone builds, but
 * the apps send their token so the gate can close without another release.
 */
export const geoEndpoints = defineEndpoints('geo', {
  search: endpoint<{ q: string; session?: string; lat?: number; lon?: number; limit?: number }, unknown>({ method: 'GET', path: (q) => withQuery('/geo/search', q) }),
  place: endpoint<{ id: string; session?: string }, { result: unknown | null }>({ method: 'GET', path: (q) => withQuery('/geo/place', q) }),
  reverse: endpoint<{ lat: number; lon: number }, { result: unknown | null }>({ method: 'GET', path: (q) => withQuery('/geo/reverse', q) }),
  timezone: endpoint<{ lat: number; lon: number }, { timezone: string | null }>({ method: 'GET', path: (q) => withQuery('/geo/timezone', q) }),
});

/** The offline protocol (shared sync/protocol.ts). Never kept by the response cache — it has its own store. */
export const syncEndpoints = defineEndpoints('sync', {
  push: endpoint<void, SyncPushResponse, { operations: unknown[] }>({ method: 'POST', path: () => '/sync/push' }),
  pull: endpoint<{ scope: SyncPullScope; cursor?: string | null }, SyncPullResponse>({ method: 'GET', path: (q) => withQuery('/sync/pull', q), keep: false }),
  mediaLinks: endpoint<void, SyncMediaLink[], { ids: string[] }>({ method: 'POST', path: () => '/sync/media-links' }),
  telemetry: endpoint<void, void, Record<string, unknown>>({ method: 'POST', path: () => '/sync/telemetry' }),
  health: endpoint<void, unknown>({ method: 'GET', path: () => '/sync/health', keep: false }),
});

export interface LocationFix {
  lat: number;
  lng: number;
  accuracy?: number;
  taskId?: string;
  timestamp?: string;
  [k: string]: unknown;
}

/** GPS. Live positions are never kept — stale is wrong, not old. */
export const trackingEndpoints = defineEndpoints('tracking', {
  location: endpoint<void, unknown, LocationFix>({ method: 'POST', path: () => '/tracking/location' }),
  /** A buffered burst of route points (the phone's background tracker). */
  locationBatch: endpoint<void, unknown, { taskId?: string; points: LocationFix[]; [k: string]: unknown }>({ method: 'POST', path: () => '/tracking/location/batch' }),
  workers: endpoint<void, unknown[]>({ method: 'GET', path: () => '/tracking/workers', keep: false }),
  spaceWorkers: endpoint<{ spaceId: string }, unknown[]>({ method: 'GET', path: (a) => path`/tracking/spaces/${a.spaceId}/workers`, keep: false }),
  worker: endpoint<Id, unknown>({ method: 'GET', path: (a) => path`/tracking/workers/${a.id}`, keep: false }),
  currentRoute: endpoint<Id, unknown>({ method: 'GET', path: (a) => path`/tracking/workers/${a.id}/current-route`, keep: false }),
  workerHistory: endpoint<Id & { from?: string; to?: string }, unknown>({
    method: 'GET',
    path: ({ id, ...q }) => withQuery(path`/tracking/workers/${id}/history`, q),
    keep: false,
  }),
  taskRoute: endpoint<{ taskId: string }, unknown>({ method: 'GET', path: (a) => path`/tracking/tasks/${a.taskId}/route`, keep: false }),
});

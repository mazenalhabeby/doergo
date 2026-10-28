import * as SecureStore from 'expo-secure-store';
import {
  ApiError,
  apiEndpoints,
  createApiClient,
  type ApiClient,
  type CallArgs,
  type Endpoint,
  type EndpointArgs,
  type EndpointBody,
  type RefreshResult,
} from '@hbcfield/shared/client';
import { networkErrorText } from './network-error';
import type { User } from './types';
import { jwtExpiry, jwtSubject } from './session-owner';
import { getApiUrl, APP_VERSION, APP_PLATFORM } from './client-build';
import { uuidv7 } from '@/offline/ids';
import { notifyObservers } from './response-observers';
import { meterRequest } from './request-meter';
import { type RefreshOutcome, refreshRefusedSession, phoneFetch, phoneMessage, cacheHooks } from './phone-transport';
export { type RefreshOutcome, refreshRefusedSession, phoneFetch } from './phone-transport';
export { type ResponseObservation, observeResponses } from './response-observers';
export { getApiUrl, APP_VERSION, resolveMediaUrl } from './client-build';

/*
  THE PHONE'S API CLIENT — a plug-in of the shared core (`@hbcfield/shared`
  http/core/create-client.ts). Everything a request goes through (the token, one
  401 → refresh → retry, the per-attempt timeout, GET merging, the offline
  cache, retries, the envelope) is decided THERE, once, for the web, the phone
  and the console. What lives here is only what is the phone's own: where the
  tokens are kept, how a session is refreshed, which build is asking, what a
  failure reads like in the member's language, and who listens.

  ⚠️ Codes a screen may meet for "nothing answered" (all status 0):
     NETWORK (was NO_CONNECTION), TIMEOUT (was 408 / SLOW_CONNECTION),
     SESSION_UNREACHABLE (unchanged), ABORTED (the caller's own cancel).
  Use `isUnreachable` (src/offline/actions/unreachable.ts), never a status list.
*/
export { ApiError };

// Token storage keys
const ACCESS_TOKEN_KEY = 'hbcfield_access_token';
const REFRESH_TOKEN_KEY = 'hbcfield_refresh_token';
/** When the session now on this phone began — see `sessionStartedAt`. */
const SESSION_STARTED_KEY = 'hbcfield_session_started_at';

// ============================================================================
// Token Management
// ============================================================================

/*
  Whose tokens these are, remembered for this run of the app.

  `undefined` = not read yet (a cold start, before any request); `null` = no
  session. Kept in memory so the GET merge can key by person without an await
  in front of the lookup (`sessionKey` below).
*/
let knownOwner: string | null | undefined;
/** In-memory copy of SESSION_STARTED_KEY. */
let knownSessionStart: number | null | undefined;

export async function getAccessToken(): Promise<string | null> {
  const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  if (knownOwner === undefined) knownOwner = jwtSubject(token);
  return token;
}

/**
 * An access token good for at least `minSeconds` more — refreshed first when the
 * stored one is about to lapse (one shared refresh). For the live socket: it
 * reconnects without going through the HTTP client's 401 → refresh path, and
 * the server cycles every socket the moment its token expires (15 min), so a
 * reconnect with the stored token was refused and the phone went deaf to live
 * updates until something else happened to refresh. Mirrors the web's
 * getFreshAccessToken.
 */
export async function getFreshAccessToken(minSeconds = 30): Promise<string | null> {
  const token = await getAccessToken();
  const exp = jwtExpiry(token);
  if (token && exp !== null && exp * 1000 - Date.now() > minSeconds * 1000) return token;
  const outcome = await refreshSession().catch(() => null);
  return outcome?.kind === 'refreshed' ? outcome.accessToken : token;
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

/**
 * The member the stored tokens were issued to — their `sub` — or null when
 * nobody is signed in. Work kept on the phone is only ever sent when this is
 * its owner (background sync, kept check-ins, route points).
 */
export async function sessionOwnerId(): Promise<string | null> {
  try {
    return jwtSubject(await getAccessToken());
  } catch {
    return null;
  }
}

/**
 * When the session now on this phone began (epoch ms), or null when there is
 * none. A push that arrived BEFORE it was meant for somebody else's session —
 * its buttons must not act as the person signed in now.
 */
export async function sessionStartedAt(): Promise<number | null> {
  if (knownSessionStart !== undefined) return knownSessionStart;
  const raw = await SecureStore.getItemAsync(SESSION_STARTED_KEY).catch(() => null);
  const at = raw ? Number(raw) : NaN;
  knownSessionStart = Number.isFinite(at) ? at : null;
  return knownSessionStart;
}

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  /*
    AFTER_FIRST_UNLOCK: the keychain item stays readable while the phone is
    LOCKED (after the first unlock post-boot). The default (WHEN_UNLOCKED) throws
    errSecInteractionNotAllowed in headless background tasks on a locked device,
    so the background GPS/heartbeat task couldn't read the token → route gaps and
    a permanent tracker deregister. (Sec audit H12.)

    ⚠️ _THIS_DEVICE_ONLY is the other half, and it is about a different attack.
    Without it the item travels in an ENCRYPTED BACKUP: restore that backup onto
    a second phone and it is silently signed in as the member, with a refresh
    token that renews itself for 30 days. The suffix costs nothing — background
    reads on a locked device work exactly the same — and it is the only thing
    stopping a session from being cloned by a device migration.
  */
  const opts = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
  const previous = await sessionOwnerId();
  const owner = jwtSubject(accessToken);
  /*
    A NEW session — nobody signed in before, or somebody else was — starts its
    clock now. A refresh for the same member keeps the original start.
  */
  const sameMember = !!previous && previous === owner;
  const started = sameMember ? await sessionStartedAt() : null;
  // The same member with no recorded start (a session from before this was kept): 0 = "began before
  // anything this phone holds", so none of their own pushes is ever mistaken for somebody else's.
  const startAt = started ?? (sameMember ? 0 : Date.now());
  if (previous !== owner) {
    // Somebody else's answers must not be handed to this member.
    api.clearInflight();
  }
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken, opts),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken, opts),
    started !== null ? Promise.resolve() : SecureStore.setItemAsync(SESSION_STARTED_KEY, String(startAt), opts),
  ]);
  knownOwner = owner;
  knownSessionStart = startAt;
}

export async function clearTokens(): Promise<void> {
  // First, synchronously: a GET answered for the last person must never be
  // handed to the next one — not even one still in flight.
  api.clearInflight();
  knownOwner = null;
  knownSessionStart = null;
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(SESSION_STARTED_KEY).catch(() => undefined),
  ]);
}

// ============================================================================
// Auth Failure Callback
// ============================================================================

// Called when the server has said the session is over (the refresh token was refused).
let onAuthFailure: (() => void) | null = null;

export function setAuthFailureCallback(callback: (() => void) | null) {
  onAuthFailure = callback;
}

// Callback to update user data when refresh returns fresh user info
let onUserRefreshed: ((user: User) => void) | null = null;

export function setUserRefreshedCallback(callback: (user: User) => void) {
  onUserRefreshed = callback;
}

let refreshPromise: Promise<RefreshOutcome> | null = null;

/**
 * Refresh the access token. One request at a time: concurrent callers share it
 * (the backend also tolerates the same token twice within a grace period).
 */
export function refreshSession(): Promise<RefreshOutcome> {
  if (refreshPromise) return refreshPromise;

  // Created IMMEDIATELY (synchronously) before any await.
  refreshPromise = (async (): Promise<RefreshOutcome> => {
    try {
      const storedRefreshToken = await getRefreshToken();
      if (!storedRefreshToken) return { kind: 'invalid' };

      let data: { accessToken?: string; refreshToken?: string; user?: User } | null;
      try {
        // Public: a refresh must never itself trigger a refresh. Not retried — the
        // caller's own request is what gets asked again.
        data = await api.call(apiEndpoints.auth.refresh, undefined, {
          body: { refreshToken: storedRefreshToken },
          retry: false,
          dedupe: false,
        });
      } catch (err) {
        if (err instanceof ApiError && err.kind === 'http' && refreshRefusedSession(err.status)) {
          await clearTokens();
          return { kind: 'invalid' };
        }
        // 429, 5xx, a proxy's error page, no network, a timeout: the server decided nothing.
        return { kind: 'unreachable' };
      }

      // A 2xx we cannot read is not proof of anything — keep what we have.
      if (!data?.accessToken || !data?.refreshToken) return { kind: 'unreachable' };

      await saveTokens(data.accessToken, data.refreshToken);

      // Update user data if returned by refresh (eliminates /auth/me call)
      if (data.user && onUserRefreshed) {
        onUserRefreshed(data.user);
      }

      return { kind: 'refreshed', accessToken: data.accessToken };
    } catch {
      // NOT proof the session is invalid. A field worker in poor coverage must
      // not be logged out and lose their clocked-in context. (Sec audit mobile-H2.)
      return { kind: 'unreachable' };
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/** The older shape — the new access token, or null for any failure. Prefer `refreshSession`. */
export async function refreshAccessToken(): Promise<string | null> {
  const outcome = await refreshSession();
  return outcome.kind === 'refreshed' ? outcome.accessToken : null;
}

/** `refreshSession`, as the core's tri-state. */
export async function refreshForCore(): Promise<RefreshResult> {
  const outcome = await refreshSession();
  return outcome.kind;
}

// ── The client ──────────────────────────────────────────────────────────────

export const api: ApiClient = createApiClient({
  baseUrl: getApiUrl,
  getToken: getAccessToken,
  refresh: refreshForCore,
  /*
    The server refused the session — notify the auth context, which ends it.
    The core only says so for a request that CARRIED a token: one that carried
    none is a screen still asking after its session already ended (a sign-out
    in progress), and reporting it would end the same session a second time.
  */
  onSessionEnded: () => {
    onAuthFailure?.();
  },
  headers: () => ({ 'X-Client-Platform': 'mobile', 'X-App-Version': APP_VERSION, 'X-App-Platform': APP_PLATFORM }),
  fetch: phoneFetch,
  timeoutMs: 15_000,
  requestId: () => uuidv7(), // a write's Idempotency-Key, from the native random source (Hermes has no crypto global)
  /*
    ⚠️ MERGED BY PERSON AND ENDPOINT, AND EMPTIED WHEN THE TOKENS GO. Keyed by
    the endpoint alone, a `/attendance/status` still in flight when one member
    signed out was handed — answer and all — to the next member who asked.
  */
  dedupeGets: true,
  sessionKey: () => knownOwner ?? null,
  cache: cacheHooks,
  observe: {
    response: (o) => (meterRequest(o), notifyObservers({ kind: 'response', status: o.status, serverTime: o.serverTime })),
    /*
      Only "nothing answered" — and only after the one retry a read gets, so a
      blip the retry survived leaves no trace (the connectivity monitor counts
      two failures in a row as a weak connection). A timeout is "slow", not
      "offline", and never told it, as before.
    */
    networkError: (o) => {
      if (o.kind === 'network') notifyObservers({ kind: 'network-error' });
    },
    error: (e) => phoneMessage(e),
  },
  messages: {
    network: () => networkErrorText('offline'),
    timeout: () => networkErrorText('slow'),
  },
});

/** Every merged GET is forgotten — on sign-out, before anything else. */
export function clearInflightRequests(): void {
  api.clearInflight();
}

/**
 * `api.call`, answered as the phone's own view of the answer: each domain
 * function declares the type its screens read. The arguments and the body are
 * still checked against the endpoint.
 */
export const call = api.call as <D extends Endpoint<any, any, any>>(
  def: D,
  ...rest: CallArgs<EndpointArgs<D>, EndpointBody<D>>
) => Promise<any>;

/** The endpoint table, by domain — `E.tasks.get`. */
export const E = apiEndpoints;

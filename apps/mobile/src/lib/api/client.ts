import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  ApiError,
  TRANSPORT_CODES,
  apiEndpoints,
  createApiClient,
  type ApiClient,
  type CacheRequest,
  type CallArgs,
  type Endpoint,
  type EndpointArgs,
  type EndpointBody,
  type FetchLike,
  type RefreshResult,
  type ResponseLike,
} from '@hbcfield/shared/client';
import { keepResponse, keptResponse } from './response-cache';
import { networkErrorText } from './network-error';
import { resolveApiUrl } from './base-url';
import { urlEnvironment } from './url-environment';
import { jwtSubject } from './session-owner';

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

/**
 * The API's address. ⚠️ A release build only ever gets an https address — see
 * `base-url.ts`, shared with the socket so the two can never disagree again.
 */
export function getApiUrl(): string {
  return resolveApiUrl(urlEnvironment());
}


/*
  Which build this is, sent on every request.

  The server had no way to know what anybody was running. When a crash took out
  every Play Store user, "who is affected" and "who still needs to update" could
  not be asked at all, so the only available response was to notify everybody.

  Two headers rather than a parsed user-agent: this is a fact the app knows
  about itself, and guessing it from a string other libraries also write is how
  it silently stops being true.
*/
export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';
const APP_PLATFORM: string = Platform.OS === 'ios' ? 'ios' : 'android';

/**
 * Resolve a media path (e.g. an uploaded avatar `/uploads/avatars/…`) to an
 * absolute URL. React Native's <Image> can't load relative URIs, so uploaded
 * avatars render blank without this. Absolute URLs (http/https, data:) pass
 * through unchanged. The origin is the API host without the `/api/v1` prefix,
 * since static uploads are served from the host root.
 */
export function resolveMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:')) return url;
  const origin = getApiUrl().replace(/\/api\/v\d+\/?$/, '');
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

// Token storage keys
const ACCESS_TOKEN_KEY = 'hbcfield_access_token';
const REFRESH_TOKEN_KEY = 'hbcfield_refresh_token';
/** When the session now on this phone began — see `sessionStartedAt`. */
const SESSION_STARTED_KEY = 'hbcfield_session_started_at';

// ============================================================================
// Response observers
// ============================================================================

/**
 * What every request tells the rest of the app, without the client knowing who
 * listens: the server's clock (the anchor offline timestamps are checked
 * against) and whether the network actually worked (NetInfo alone reports a
 * site Wi-Fi with no internet as "connected").
 *
 * The offline layer subscribes; this file stays free of it.
 */
export type ResponseObservation =
  | { kind: 'response'; status: number; serverTime: string | null }
  | { kind: 'network-error' };

const responseObservers = new Set<(o: ResponseObservation) => void>();

export function observeResponses(cb: (o: ResponseObservation) => void): () => void {
  responseObservers.add(cb);
  return () => responseObservers.delete(cb);
}

function notifyObservers(o: ResponseObservation) {
  for (const cb of responseObservers) {
    try {
      cb(o);
    } catch {
      /* an observer must never break a request */
    }
  }
}

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
let onUserRefreshed: ((user: any) => void) | null = null;

export function setUserRefreshedCallback(callback: (user: any) => void) {
  onUserRefreshed = callback;
}

// ============================================================================
// Token Refresh
// ============================================================================

/**
 * What a refresh found out — three answers, because two were one too few.
 *
 * - `refreshed`: a new pair is stored.
 * - `invalid`: the SERVER said no (400/401/403) or there is no refresh token.
 *   The session is over; only this clears the tokens and signs the member out.
 * - `unreachable`: anything else — no network, a timeout, a 429, a 5xx, an
 *   answer that could not be read. Says nothing about the session, so the
 *   tokens stay and the request that needed them fails with a retryable error.
 *
 * ⚠️ It used to be two: a 502 from a restarting gateway or a 429 at shift
 * change was "refresh failed", which cleared the tokens and logged a field
 * worker out mid-shift — losing their clocked-in context to a server blip.
 *
 * The core asks this through `config.refresh` (mapped to its own tri-state);
 * the core makes it single-flight across requests, and so does this function
 * for its direct callers (the biometric unlock, the auth context).
 */
export type RefreshOutcome =
  | { kind: 'refreshed'; accessToken: string }
  | { kind: 'invalid' }
  | { kind: 'unreachable' };

/** Only these answers from /auth/refresh mean the session itself is no longer valid. */
export function refreshRefusedSession(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
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

      let data: { accessToken?: string; refreshToken?: string; user?: unknown } | null;
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

// ============================================================================
// The transport, the cache, the sentences
// ============================================================================

/**
 * `fetch`, with one rule the phone has always had: a body that is present but
 * is NOT JSON, on a 2xx or a 5xx, is no answer at all.
 *
 * A 502/503 page from the proxy while the gateway restarts, or a captive
 * portal's HTML on a site Wi-Fi, is the network failing, not the server
 * deciding — so the member keeps the kept answers and the outbox tries again
 * later, exactly as before the client moved onto the shared core (which would
 * read a 502 page as a refusal). 4xx answers are decisions whatever their body.
 */
export const phoneFetch: FetchLike = async (url, init) => {
  const fetchImpl = (globalThis as { fetch?: FetchLike }).fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('Network request failed');
  const res = await fetchImpl(url, init);
  if (res.status === 204 || res.status === 205) return res;
  if (res.status >= 300 && res.status < 500) return res;
  if (typeof (res as Partial<ResponseLike>).text !== 'function') return res;
  const text = await res.text();
  if (text.trim()) {
    try {
      JSON.parse(text);
    } catch {
      throw new TypeError('Network request failed');
    }
  }
  const replay: ResponseLike = { status: res.status, ok: res.ok, headers: res.headers, text: async () => text };
  return replay;
};

/**
 * The phone's sentences for refusals, kept as they were: a 401 that the
 * refresh could not save is "Session expired" (the auth context ends the
 * session; the root handler stays quiet about it), any other 401 — a wrong
 * password — is "Authentication failed", a 429 is "Too many requests".
 */
function phoneMessage(e: ApiError): void {
  if (e.kind !== 'http') return;
  let text: string | null = null;
  if (e.status === 401) text = e.code === TRANSPORT_CODES.sessionEnded ? 'Session expired' : 'Authentication failed';
  else if (e.status === 429) text = 'Too many requests. Please wait.';
  if (text) {
    try {
      (e as { message: string }).message = text;
    } catch {
      /* a frozen error keeps the core's sentence */
    }
  }
}

/**
 * The cache hooks. The endpoint's own verdict (`endpoint({ keep })` in the
 * shared table) decides first; a path the table has not marked falls back to
 * the phone's allow-list (response-cache.ts).
 */
const cacheHooks = {
  read: (req: CacheRequest) => keptResponse(req.path, req.keep),
  write: (req: CacheRequest, data: unknown) => keepResponse(req.path, data, req.keep),
};

// ============================================================================
// The client
// ============================================================================

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
  headers: () => ({
    'X-Client-Platform': 'mobile',
    'X-App-Version': APP_VERSION,
    'X-App-Platform': APP_PLATFORM,
  }),
  fetch: phoneFetch,
  timeoutMs: 15_000,
  /*
    ⚠️ MERGED BY PERSON AND ENDPOINT, AND EMPTIED WHEN THE TOKENS GO. Keyed by
    the endpoint alone, a `/attendance/status` still in flight when one member
    signed out was handed — answer and all — to the next member who asked.
  */
  dedupeGets: true,
  sessionKey: () => knownOwner ?? null,
  cache: cacheHooks,
  observe: {
    response: (o) => notifyObservers({ kind: 'response', status: o.status, serverTime: o.serverTime }),
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

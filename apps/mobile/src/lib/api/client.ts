import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { keepResponse, keptResponse } from './response-cache';
import { networkErrorText } from './network-error';
import { resolveApiUrl } from './base-url';
import { urlEnvironment } from './url-environment';
import { envelopeMeta, readBody, refusalDetails, unwrapEnvelope, type PageMeta } from './envelope';
import { jwtSubject } from './session-owner';

/**
 * The API's address. ⚠️ A release build only ever gets an https address — see
 * `base-url.ts`, shared with the socket so the two can never disagree again.
 */
export function getApiUrl(): string {
  return resolveApiUrl(urlEnvironment());
}

export const API_URL = getApiUrl();

/*
  Which build this is, sent on every authenticated request.

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
  const origin = getApiUrl().replace(/\/api\/v1\/?$/, '');
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

// Token storage keys
const ACCESS_TOKEN_KEY = 'hbcfield_access_token';
const REFRESH_TOKEN_KEY = 'hbcfield_refresh_token';
/** When the session now on this phone began — see `sessionStartedAt`. */
const SESSION_STARTED_KEY = 'hbcfield_session_started_at';

// ============================================================================
// API Response / Error
// ============================================================================

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
  statusCode?: number;
  error?: string;
}

export class ApiError extends Error {
  statusCode: number;
  /** The server's machine-readable reason (e.g. TASK_REASSIGNED), when it sent one. */
  code?: string;
  /**
   * The values the server's sentence is written with (`distanceMetres`,
   * `radiusMetres`, `previousAt`…) — what `refusalText` fills a translated
   * refusal from. Without them a coded refusal could only be shown in the
   * server's English, or with its numbers missing.
   */
  params?: Record<string, unknown>;

  constructor(message: string, statusCode: number, code?: string, params?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    if (params) this.params = params;
    this.name = 'ApiError';
  }
}

/** A refusal from the server, as the error every screen already knows how to read. */
function refusal(body: unknown, status: number): ApiError {
  const { code, params } = refusalDetails(body);
  const message = (body as { message?: unknown } | null)?.message;
  return new ApiError(sanitizeErrorMessage(typeof message === 'string' ? message : undefined, status), status, code, params);
}

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
  session. Kept in memory so the GET merge below can key by person without an
  await in front of the lookup.
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
    inflightRequests.clear();
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
  inflightRequests.clear();
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
 */
export type RefreshOutcome =
  | { kind: 'refreshed'; accessToken: string }
  | { kind: 'invalid' }
  | { kind: 'unreachable' };

/** Only these answers from /auth/refresh mean the session itself is no longer valid. */
export function refreshRefusedSession(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}

// Token refresh state - shared promise prevents concurrent refreshes
let refreshPromise: Promise<RefreshOutcome> | null = null;

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  user?: any;
}

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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      let response: Response;
      try {
        response = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Platform': 'mobile',
          },
          body: JSON.stringify({ refreshToken: storedRefreshToken }),
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (refreshRefusedSession(response.status)) {
        await clearTokens();
        return { kind: 'invalid' };
      }
      // 429, 5xx, a proxy's error page: the server did not decide anything.
      if (!response.ok) return { kind: 'unreachable' };

      const result = (await readBody(response).catch(() => null)) as ApiResponse<RefreshResponse> | null;
      const data = unwrapEnvelope<RefreshResponse | null>(result);
      // A 2xx we cannot read is not proof of anything — keep what we have.
      if (!data?.accessToken || !data?.refreshToken) return { kind: 'unreachable' };

      await saveTokens(data.accessToken, data.refreshToken);

      // Update user data if returned by refresh (eliminates /auth/me call)
      if (data.user && onUserRefreshed) {
        onUserRefreshed(data.user);
      }

      return { kind: 'refreshed', accessToken: data.accessToken };
    } catch {
      // Network error / timeout / abort — NOT proof the session is invalid. A
      // field worker in poor coverage must not be logged out and lose their
      // clocked-in context. (Sec audit mobile-H2.)
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

// ============================================================================
// HTTP Fetch Functions
// ============================================================================

/*
  Request deduplication for GET requests.

  ⚠️ KEYED BY PERSON AND ENDPOINT, AND EMPTIED WHEN THE TOKENS GO. Keyed by the
  endpoint alone, a `/attendance/status` still in flight when one member signed
  out was handed — answer and all — to the next member who asked for it.
*/
const inflightRequests = new Map<string, Promise<any>>();
const inflightKey = (endpoint: string) => `${knownOwner ?? '?'}|${endpoint}`;

/** Every merged GET is forgotten — on sign-out, before anything else. */
export function clearInflightRequests(): void {
  inflightRequests.clear();
}

/** Headers every request carries. */
function baseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Client-Platform': 'mobile',
    'X-App-Version': APP_VERSION,
    'X-App-Platform': APP_PLATFORM,
  };
}

/**
 * Base fetch function without auth
 */
export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...baseHeaders(),
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    const body = await readBody(response);

    if (!response.ok) throw refusal(body, response.status);

    return unwrapEnvelope<T>(body);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(networkErrorText('slow'), 408, 'SLOW_CONNECTION');
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(networkErrorText('offline'), 0, 'NO_CONNECTION');
  }
}

/** Sanitize server error messages — don't expose internal details to UI */
function sanitizeErrorMessage(message: string | undefined, status: number): string {
  if (status === 401) return 'Authentication failed';
  if (status === 429) return 'Too many requests. Please wait.';
  // Allow 400/403/404 messages through — they contain useful validation info
  if (message && (status === 400 || status === 403 || status === 404 || status === 409)) return message;
  return message || 'An error occurred';
}

/**
 * Authenticated fetch with automatic 401 handling, retry, and GET deduplication.
 * Resolves to the answer itself — the envelope's `data` (see `envelope.ts`).
 */
export async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();

  // Deduplicate GET requests - reuse in-flight promise for same person + endpoint
  const key = inflightKey(endpoint);
  if (method === 'GET') {
    const existing = inflightRequests.get(key);
    if (existing) {
      return existing as Promise<T>;
    }
  }

  const promise =
    method === 'GET'
      ? getKeptWhenOffline<T>(endpoint, options, retry)
      : _fetchWithAuthInner(endpoint, options, retry).then((body) => unwrapEnvelope<T>(body));

  if (method === 'GET') {
    inflightRequests.set(key, promise);
    /*
      `.finally()` returns a NEW promise, and it rejects whenever the request
      does. Nobody awaits that one, so every failed GET also produced an
      unhandled rejection — a warning in the app, and enough to take a test
      runner down. The caller still gets the real rejection from `promise`.
    */
    void promise
      .finally(() => {
        if (inflightRequests.get(key) === promise) inflightRequests.delete(key);
      })
      .catch(() => undefined);
  }

  return promise;
}

/**
 * A page of a list WITH its `meta` (`total`, `totalPages`…) — the one thing
 * `fetchWithAuth` cannot give, because it resolves to the answer itself.
 *
 * Not merged and not kept offline: a caller asking for the total is asking the
 * server, and a kept list would answer with yesterday's count.
 */
export async function fetchPageWithAuth<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<{ data: T; meta: PageMeta | null }> {
  const body = await _fetchWithAuthInner(endpoint, options, true, (options.method || 'GET').toUpperCase() === 'GET');
  return { data: unwrapEnvelope<T>(body), meta: envelopeMeta(body) };
}

/**
 * A GET that keeps its answer, and falls back to the kept one when there is no
 * network (see response-cache.ts). A refusal from the server is never masked —
 * only "could not reach it".
 */
async function getKeptWhenOffline<T>(endpoint: string, options: RequestInit, retry: boolean): Promise<T> {
  try {
    const body = unwrapEnvelope<T>(await _fetchWithAuthInner(endpoint, options, retry, true));
    keepResponse(endpoint, body);
    return body;
  } catch (err) {
    if (err instanceof ApiError && (err.statusCode === 0 || err.statusCode === 408)) {
      const kept = await keptResponse(endpoint);
      if (kept !== undefined) return kept as T;
    }
    throw err;
  }
}

/**
 * How long to wait before trying a request that never reached the server once
 * more. Long enough for a connection the OS tore down to be replaced, short
 * enough that nobody sees the difference.
 */
const NETWORK_RETRY_MS = 400;

/** The raw body of an authenticated request — still in its envelope. */
async function _fetchWithAuthInner(
  endpoint: string,
  options: RequestInit = {},
  retry = true,
  /**
   * Try once more when nothing answered.
   *
   * The FIRST request after the app is reopened fails on its own often enough
   * to be the common case: the process was killed, and the connection pool it
   * left behind is stale — so the member was shown "You're offline" on a phone
   * with full signal, and a Retry button that worked every time, which is the
   * evidence it was never offline.
   *
   * GET only, and set at the one GET call site. A write must never be sent
   * twice on a guess: nothing here carries an idempotency key, and the writes
   * that must survive no signal go through the outbox (src/offline).
   */
  retryNetwork = false
): Promise<unknown> {
  const accessToken = await getAccessToken();
  const url = `${API_URL}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...baseHeaders(),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);
    notifyObservers({ kind: 'response', status: response.status, serverTime: response.headers.get('x-server-time') });

    // Handle 401 - Automatic token refresh and retry
    if (response.status === 401 && retry) {
      const outcome = await refreshSession();

      if (outcome.kind === 'refreshed') {
        return _fetchWithAuthInner(endpoint, options, false, retryNetwork);
      }

      if (outcome.kind === 'unreachable') {
        /*
          ⚠️ The server could not be asked, so nothing is known about the
          session: the tokens stay, nobody is signed out, and this request
          fails the way a request with no signal does — retryable, kept answers
          shown, the outbox trying again later.
        */
        throw new ApiError(networkErrorText('offline'), 0, 'SESSION_UNREACHABLE');
      }

      /*
        The server refused the session — notify auth context, which ends it.
        Not for a request that carried NO token: that is a screen still asking
        after its session already ended (a sign-out in progress), and reporting
        it would only end the same session a second time.
      */
      if (onAuthFailure && accessToken) {
        onAuthFailure();
      }
      throw new ApiError('Session expired', 401);
    }

    const body = await readBody(response);

    if (!response.ok) throw refusal(body, response.status);

    return body;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(networkErrorText('slow'), 408, 'SLOW_CONNECTION');
    }
    if (error instanceof ApiError) {
      throw error;
    }
    /*
      ⚠️ Nothing is queued here any more. A failed write used to be pushed onto an
      in-memory list that nothing ever sent — and, had anything sent it, would
      have duplicated the write, since it carried no idempotency key. Writes that
      must survive being offline go through the outbox (src/offline).
    */
    /*
      One more try before anyone is told they are offline — and before the
      connectivity monitor is told, which counts two failures in a row as a
      weak connection. A blip that the retry survives must leave no trace.
    */
    if (retryNetwork) {
      await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_MS));
      return _fetchWithAuthInner(endpoint, options, retry, false);
    }
    notifyObservers({ kind: 'network-error' });
    throw new ApiError(networkErrorText('offline'), 0, 'NO_CONNECTION');
  }
}

/**
 * The console's plug-in of the SHARED request pipeline.
 *
 * Everything a request goes through — the base URL, the bearer token, JSON in
 * and out, the envelope, a per-attempt timeout that follows the caller's
 * signal, 429/5xx retries, the error shape, refusing absolute URLs — is
 * `createApiClient` in @hbcfield/shared (packages/shared/src/http). This file
 * says only what is the console's own:
 *
 *   • where the token lives (memory, mirrored to sessionStorage: dies with the tab);
 *   • no refresh on a 401 — the console slides its token itself (lib/session.ts),
 *     so a 401 means the session is over and EVERY screen goes back to sign-in;
 *   • the 2FA-enrolment refusal sends the console to the enrolment screen;
 *   • `credentials: 'omit'` (no cookie), `cache: 'no-store'`, 20 s per attempt.
 *
 * ⚠️ Nothing else in apps/admin calls `fetch` (admin-fetch-guard.spec.ts).
 */
import {
  ApiError,
  PLATFORM_2FA_ENROLMENT_REQUIRED,
  createApiClient,
  isApiError,
  type ApiClient,
  type ApiClientConfig,
} from '@hbcfield/shared/client';

export { ApiError };

/** The API base. Same-origin `/api/v1` in production (admin.hbcfield.com proxies it). */
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api/v1').replace(/\/$/, '');

/**
 * Socket.IO origin: NEXT_PUBLIC_SOCKET_URL when set (local dev, where the
 * socket server is its own port), else the API's origin — '' = same origin,
 * which is production (nginx routes /socket.io/ on admin.hbcfield.com).
 */
export const SOCKET_ORIGIN = (process.env.NEXT_PUBLIC_SOCKET_URL || API_BASE.replace(/\/api\/v\d+$/, '')).replace(/\/$/, '');

/** Fired on window when the server says the session is over (any 401 on a session call). */
export const SESSION_EXPIRED_EVENT = 'platform:session-expired';
/** Fired when the server says this session may only enrol a second factor. */
export const ENROLMENT_REQUIRED_EVENT = 'platform:enrolment-required';
export const ENROLMENT_REQUIRED_CODE = PLATFORM_2FA_ENROLMENT_REQUIRED;

export const REQUEST_TIMEOUT_MS = 20_000;
const TOKEN_KEY = 'platformToken';
const TOKEN_AT_KEY = 'platformTokenAt';

// ── Token: held in memory, mirrored to sessionStorage (dies with the tab) ─────
let token = '';
let tokenAt = 0;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function getToken(): string {
  if (!token) {
    const s = storage();
    token = s?.getItem(TOKEN_KEY) ?? '';
    tokenAt = Number(s?.getItem(TOKEN_AT_KEY) ?? 0) || 0;
  }
  return token;
}

/** When the current token was received (ms) — the console refreshes it before it runs out. */
export function getTokenAt(): number {
  getToken();
  return tokenAt;
}

export function setToken(next: string): void {
  token = next;
  tokenAt = Date.now();
  const s = storage();
  try {
    s?.setItem(TOKEN_KEY, next);
    s?.setItem(TOKEN_AT_KEY, String(tokenAt));
  } catch {
    /* private mode: memory only */
  }
}

export function clearToken(): void {
  token = '';
  tokenAt = 0;
  const s = storage();
  try {
    s?.removeItem(TOKEN_KEY);
    s?.removeItem(TOKEN_AT_KEY);
  } catch {
    /* nothing stored */
  }
}

function announce(name: string): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(name));
}

// ── The client ────────────────────────────────────────────────────────────────

/** The console's configuration of the shared core — exported so its spec can check it. */
export function consoleClientConfig(overrides: Partial<ApiClientConfig> = {}): ApiClientConfig {
  return {
    baseUrl: () => API_BASE,
    getToken: () => getToken() || null,
    // No `refresh`: a 401 on a call that carried a token is the end of the session.
    onSessionEnded: () => {
      clearToken();
      announce(SESSION_EXPIRED_EVENT);
    },
    observe: {
      error: (e) => {
        if (e.status === 403 && e.code === ENROLMENT_REQUIRED_CODE) announce(ENROLMENT_REQUIRED_EVENT);
      },
    },
    credentials: 'omit',
    fetchCache: 'no-store',
    timeoutMs: REQUEST_TIMEOUT_MS,
    // The console's own sentences for a request that reached nothing.
    messages: { network: 'Cannot reach the server', timeout: 'The server did not answer in time' },
    ...overrides,
  };
}

/** THE client. Screens never use it directly — they call lib/api/endpoints.ts. */
export const api: ApiClient = createApiClient(consoleClientConfig());

// ── Errors ────────────────────────────────────────────────────────────────────

export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (isApiError(e) || e instanceof Error) return e.message || fallback;
  return fallback;
}

/** Was this rejection the caller cancelling (a newer search replaced it)? */
export function isAbort(e: unknown): boolean {
  return (isApiError(e) && e.kind === 'aborted') || (e instanceof DOMException && e.name === 'AbortError');
}

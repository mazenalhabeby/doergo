import {
  ApiError,
  TRANSPORT_CODES,
  type CacheRequest,
  type FetchLike,
  type ResponseLike,
} from '@hbcfield/shared/client';
import { keepResponse, keptResponse } from './response-cache';

/** The phone's transport rules, cache hooks and refresh verdicts — moved here unchanged from client.ts. */
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
export type RefreshOutcome = { kind: 'refreshed'; accessToken: string } | { kind: 'invalid' } | { kind: 'unreachable' };

/** Only these answers from /auth/refresh mean the session itself is no longer valid. */
export function refreshRefusedSession(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
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
export function phoneMessage(e: ApiError): void {
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
export const cacheHooks = {
  read: (req: CacheRequest) => keptResponse(req.path, req.keep),
  write: (req: CacheRequest, data: unknown) => keepResponse(req.path, data, req.keep),
};

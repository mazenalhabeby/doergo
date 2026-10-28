/**
 * THE request pipeline — one implementation for the web app, the phone and the
 * admin console. Each app plugs in only what differs (where tokens live, how a
 * session is refreshed, which headers name the build); everything a request
 * goes through is decided here once:
 *
 *   • the base URL, the bearer token, JSON in and out, the envelope;
 *   • a timeout per attempt that also follows the caller's own AbortSignal;
 *   • ONE 401 → refresh → retry, with the refresh single-flight across every
 *     request in the app, and a TRI-STATE answer: only `invalid` ends the
 *     session; `unreachable` keeps it and fails the request as a network error
 *     (a gateway restart must not sign out a field worker mid-shift);
 *   • retries for answers that say "not now" rather than "no":
 *       – 429 for ANY method: the gateway's rate limiter refuses before any
 *         handler runs, so nothing was written and asking again is safe.
 *         Retry-After (and the limiter's `Retry-After-<window>`) is honoured;
 *       – 502 / 503 / 504 (and 408) for GET and HEAD, and for a write with its
 *         key — the server runs a repeated key once;
 *       – one more try for a GET/HEAD (or keyed write) that reached nothing: the first request
 *         after an app is reopened often fails on a stale connection pool;
 *   • GET de-duplication keyed by WHO is asking (`sessionKey`) and the path —
 *     keyed by path alone, an answer in flight when one member signed out was
 *     handed to the next member who asked for it;
 *   • an optional response cache (the phone's offline answers) consulted only
 *     when nothing answered — a refusal from the server is never masked;
 *   • every signed-in write carries an `Idempotency-Key` (client/request-id.ts):
 *     a write that got no answer is sent again under the same key, and the
 *     person tapping again after "no connection" sends the same key too — the
 *     server answers a repeat with the first answer, so it happens once;
 *   • failures as an `ApiError` with a `kind`, never a fake 500.
 *
 * ⚠️ The core never logs. Bodies, tokens and query strings stay out of every
 * error it builds; observers get the status and the server clock, nothing else.
 *
 * ⚠️ Only paths: a request for an absolute URL is refused, so a bearer token can
 * never be sent to a host that is not the API. Presigned S3 uploads/downloads
 * are the one thing an app fetches itself.
 */
export {
  type RefreshResult,
  type SessionEndReason,
  type RetryPolicy,
  DEFAULT_RETRY_POLICY,
  type CacheRequest,
  type ResponseCacheHooks,
  type ResponseObservation,
  type ObserveHooks,
  type ApiClientConfig,
  type UnwrapMode,
  type RequestOptions,
  type CallOptions,
  type CallArgs,
  type ApiClient,
} from './client/types';
export { isRetryableStatus, retryAfterMs } from './client/retry';
export { createApiClient } from './client/create';
export { IDEMPOTENCY_HEADER, newRequestId, stableStringify } from './client/request-id';

/**
 * The web app's plug-in of the ONE request pipeline (`createApiClient` in
 * `@hbcfield/shared`, see packages/shared/src/http/README.md).
 *
 * Everything a request goes through — the bearer token, ONE 401 → refresh →
 * retry, a 30 s timeout per attempt that follows the caller's AbortSignal, 429
 * retried for any method honouring Retry-After, 502/503/504 retried for GET
 * only, failures as an `ApiError` with status 0 instead of a fake 500 — is
 * decided in the shared core, once, for the web, the phone and the console.
 * This file only says what is particular to a browser:
 *
 *   • the base URL comes from `lib/endpoints.ts` (the one place base URLs live);
 *   • the token is the in-memory one in `auth-session.ts`, and a refresh is
 *     auth-session's `refreshAccessToken()` — its tri-state answer mapped onto
 *     the core's (`ok` → refreshed, `ended` → invalid, `unavailable` →
 *     unreachable). auth-session already announces an ended session (the
 *     `ended` event and the BroadcastChannel to the other tabs), so the core's
 *     `onSessionEnded` has nothing left to do;
 *   • `credentials: 'include'`, so the httpOnly refresh cookie travels;
 *   • `X-Client-Platform: web`, which the Access Profile's Web/Mobile choice is
 *     enforced against;
 *   • up to four retries for "not now" answers.
 *
 * ⚠️ Nothing else in `src/` calls `fetch` (a spec enforces it): presigned S3
 * transfers and blob reads of links the API minted are the only exceptions.
 */
import {
  ApiError,
  createApiClient,
  isApiError,
  type ApiClient,
  type ApiClientConfig,
  type Endpoint,
  type EndpointArgs,
  type RefreshResult,
} from "@hbcfield/shared/client"
import { API_BASE_URL, AUTH_BASE_URL, serverApiBaseUrl } from "./endpoints"
import { getAccessToken, refreshAccessToken, type RefreshOutcome } from "./auth-session"
import { TRANSPORT_MESSAGES, isTransportMessage } from "./transport-messages"

export { TRANSPORT_MESSAGES, isTransportMessage }

const DEFAULT_TIMEOUT_MS = 30_000
/** Sign-in, register, reset: a hung gateway must not hold the sign-in button for half a minute. */
const AUTH_TIMEOUT_MS = 15_000
/** 429 (any method) and 502/503/504 (GET) are asked again up to four times. */
const WEB_RETRY = { maxRetries: 4 } as const

/** auth-session's answer, in the core's words. Only `ended` means the session is over. */
export function toRefreshResult(outcome: RefreshOutcome): RefreshResult {
  if (outcome === "ok") return "refreshed"
  if (outcome === "ended") return "invalid"
  return "unreachable"
}

/** Names this client so the Access Profile's Web / Mobile choice is enforced server-side. */
function webHeaders(): Record<string, string> {
  return { "X-Client-Platform": "web" }
}

const MESSAGES = {
  network: TRANSPORT_MESSAGES.NETWORK,
  timeout: TRANSPORT_MESSAGES.TIMEOUT,
  aborted: TRANSPORT_MESSAGES.ABORTED,
}

/** The signed-in browser's client — exported as a function so the spec can read it. */
export function webClientConfig(): ApiClientConfig {
  return {
    baseUrl: () => API_BASE_URL,
    getToken: () => getAccessToken(),
    refresh: async () => toRefreshResult(await refreshAccessToken()),
    // auth-session has already told this tab and the others (see the header).
    onSessionEnded: () => undefined,
    headers: webHeaders,
    credentials: "include",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retry: WEB_RETRY,
    messages: MESSAGES,
  }
}

/**
 * The unauthenticated auth calls. No bearer token, no refresh and no retries —
 * a 429 there is the account lockout, not the limiter. Credentials are included
 * so the gateway's Set-Cookie (the refresh token) is kept.
 */
export function authClientConfig(): ApiClientConfig {
  return {
    baseUrl: () => AUTH_BASE_URL,
    headers: webHeaders,
    credentials: "include",
    timeoutMs: AUTH_TIMEOUT_MS,
    retry: { maxRetries: 0, networkRetries: 0 },
    messages: MESSAGES,
  }
}

export const http: ApiClient = createApiClient(webClientConfig())
export const authHttp: ApiClient = createApiClient(authClientConfig())

/**
 * The API as the NEXT SERVER reads it (the blog renders there): an absolute
 * base, no session, and Next's own cache window on every GET.
 */
export function createServerApiClient(revalidateSeconds: number): ApiClient {
  return createApiClient({
    baseUrl: serverApiBaseUrl,
    fetch: (url: string, init?: RequestInit) => fetch(url, { ...init, next: { revalidate: revalidateSeconds } } as RequestInit),
    timeoutMs: 10_000,
    retry: { maxRetries: 0 },
  })
}

// ── the web's result shape ────────────────────────────────────────────────────

/**
 * What `lib/api` methods read: never throws. `cause` is the ApiError itself,
 * so a method that turns the failure back into a throw (`apiError(res)`) keeps
 * the refusal's code and params — the toast can then say it translated.
 */
export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  status: number
  /**
   * A stable identifier for a refusal, when the server sent one — the client
   * says it in the reader's language and falls back to `error` (English).
   * For failures that never reached the server: NETWORK, TIMEOUT or ABORTED.
   */
  errorCode?: string
  errorParams?: Record<string, unknown>
  cause?: ApiError
}

/** A client promise as the web's `{ status, data, error, … }` (the shared `toResult`, keeping the error). */
export async function asResult<T>(promise: Promise<T>): Promise<ApiResponse<T>> {
  try {
    return { status: 200, data: await promise }
  } catch (e) {
    if (isApiError(e)) {
      return {
        status: e.status,
        error: e.message,
        ...(e.code ? { errorCode: e.code } : {}),
        ...(e.params ? { errorParams: e.params } : {}),
        cause: e,
      }
    }
    const err = new ApiError(TRANSPORT_MESSAGES.NETWORK, { status: 0, kind: "network", code: "NETWORK" })
    return { status: 0, error: err.message, errorCode: "NETWORK", cause: err }
  }
}

interface CallOptions {
  /** The request body — JSON for an object, FormData as it is. */
  body?: unknown
  /** Appended with the shared `withQuery`: undefined / null / '' dropped, everything encoded. */
  query?: object | null
  signal?: AbortSignal
  timeoutMs?: number
  headers?: Record<string, string>
}

type CallRest<D> = void extends EndpointArgs<D>
  ? [args?: EndpointArgs<D>, opts?: CallOptions]
  : [args: EndpointArgs<D>, opts?: CallOptions]

/**
 * Call an endpoint from the shared table and get the web's result shape. The
 * answer is the body AS THE SERVER SENT IT (`unwrap: 'raw'`) — the methods in
 * `lib/api` were written against `{ success, data, meta }` and read it
 * themselves; the call site states its type (`as ApiResponse<…>`).
 *
 *   const res = await call(apiEndpoints.tasks.get, { id }) as ApiResponse<TaskResponse>
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function call<D extends Endpoint<any, any, any>>(def: D, ...rest: CallRest<D>): Promise<ApiResponse<any>> {
  const [args, opts] = rest as [EndpointArgs<D> | undefined, CallOptions | undefined]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return asResult(http.call(def, args as any, { ...(opts ?? {}), unwrap: "raw" } as any))
}

// ── a Response-shaped read, for the geocoding proxy ───────────────────────────

/** Options for `getResponse` (the `/geo/*` proxy). */
export interface RequestOptions {
  signal?: AbortSignal | null
  timeoutMs?: number
  /** Send the bearer token. Default true. */
  auth?: boolean
  headers?: Record<string, string>
}

/** The part of a `Response` the geocoding callers read. */
export interface PlainResponse {
  ok: boolean
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json(): Promise<any>
}

/**
 * A GET through the pipeline, answered like `fetch` answers: `ok: false` for a
 * refusal, a rejection only when nothing answered.
 */
export async function getResponse(pathAndQuery: string, opts: RequestOptions = {}): Promise<PlainResponse> {
  try {
    const body = await http.get(pathAndQuery, {
      unwrap: "raw",
      ...(opts.signal ? { signal: opts.signal } : {}),
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
      ...(opts.auth === false ? { auth: false } : {}),
      ...(opts.headers ? { headers: opts.headers } : {}),
    })
    return { ok: true, status: 200, json: async () => body }
  } catch (e) {
    if (isApiError(e) && e.kind === "http") {
      const err = e
      return { ok: false, status: err.status, json: async () => ({ message: err.message, code: err.code }) }
    }
    throw e
  }
}

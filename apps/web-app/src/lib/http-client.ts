/**
 * The ONE request pipeline every call to the gateway goes through — JSON calls,
 * file uploads, the geocoding proxy and the operator console alike.
 *
 * What it adds to `fetch`:
 *   • the caller's access token, and on a 401 one refresh-and-retry;
 *   • a timeout per attempt (30 s by default) that also honours a caller's
 *     own AbortSignal — a hung gateway used to leave a spinner forever;
 *   • retries for answers that say "not now" rather than "no":
 *       – 429 for ANY method: the rate limiter refuses before the handler runs,
 *         so nothing was written and repeating it is safe. Retry-After is
 *         honoured when the browser can read it;
 *       – 502 / 503 / 504 only for GET and HEAD — a POST that timed out at the
 *         proxy may still have been carried out;
 *   • network failures as a value (`status: 0`, code `NETWORK` / `TIMEOUT` /
 *     `ABORTED`) instead of a fake 500.
 */
import { API_BASE_URL } from "./endpoints"
import { getAccessToken, refreshAccessToken } from "./auth-session"

export const DEFAULT_TIMEOUT_MS = 30_000
const MAX_RETRIES = 4
const BACKOFF_BASE_MS = 1_000
const BACKOFF_CAP_MS = 10_000
const RETRY_AFTER_CAP_MS = 20_000

export interface RequestOptions extends RequestInit {
  /** Per attempt. Default 30 s. */
  timeoutMs?: number
  /** Send the bearer token and refresh on 401. Default true. */
  auth?: boolean
  /** Retries for 429 / 5xx. Default 4; 0 turns retrying off. */
  maxRetries?: number
}

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
}

/** The sentences a request with no answer carries — fixed, so a bare `new Error(response.error)` can still be recognised as transient. */
export const TRANSPORT_MESSAGES = {
  NETWORK: "Unable to reach the server. Please check your connection and try again.",
  TIMEOUT: "The server took too long to answer. Please try again.",
  ABORTED: "Request was cancelled.",
} as const

export function isTransportMessage(message: unknown): boolean {
  return message === TRANSPORT_MESSAGES.NETWORK || message === TRANSPORT_MESSAGES.TIMEOUT
}

/** A request that never got an answer. `code` is NETWORK, TIMEOUT or ABORTED. */
export class HttpTransportError extends Error {
  readonly status = 0
  constructor(
    readonly code: "NETWORK" | "TIMEOUT" | "ABORTED",
    message: string,
  ) {
    super(message)
    this.name = "HttpTransportError"
  }
}

let sleepImpl = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new HttpTransportError("ABORTED", TRANSPORT_MESSAGES.ABORTED))
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new HttpTransportError("ABORTED", TRANSPORT_MESSAGES.ABORTED))
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })

/** @internal Make waits instant in unit tests. */
export function __setSleepForTests(fn: typeof sleepImpl): void {
  sleepImpl = fn
}

const isIdempotent = (method: string) => method === "GET" || method === "HEAD"

/** Should this answer be asked again, for this method? */
export function isRetryableStatus(status: number, method: string): boolean {
  if (status === 429) return true
  return isIdempotent(method.toUpperCase()) && (status === 502 || status === 503 || status === 504)
}

/**
 * Milliseconds the server asked us to wait, or null. Reads `Retry-After` and
 * the rate limiter's per-window variants (`Retry-After-short`, …), seconds or
 * an HTTP date, and takes the longest.
 */
export function retryAfterMs(headers: Headers, now = Date.now()): number | null {
  let best: number | null = null
  headers.forEach((value, name) => {
    if (!/^retry-after(-|$)/i.test(name)) return
    const secs = Number(value)
    let ms: number | null = null
    if (Number.isFinite(secs)) ms = Math.max(0, secs * 1000)
    else {
      const at = Date.parse(value)
      if (!Number.isNaN(at)) ms = Math.max(0, at - now)
    }
    if (ms != null && (best == null || ms > best)) best = ms
  })
  return best == null ? null : Math.min(best, RETRY_AFTER_CAP_MS)
}

function backoffMs(attempt: number): number {
  const base = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt)
  return base / 2 + Math.random() * (base / 2)
}

/** One attempt with a timeout that also follows the caller's signal. */
async function fetchAttempt(url: string, init: RequestInit, timeoutMs: number, callerSignal?: AbortSignal | null): Promise<Response> {
  if (callerSignal?.aborted) throw new HttpTransportError("ABORTED", TRANSPORT_MESSAGES.ABORTED)
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const forward = () => controller.abort()
  callerSignal?.addEventListener("abort", forward, { once: true })
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch {
    if (timedOut) throw new HttpTransportError("TIMEOUT", TRANSPORT_MESSAGES.TIMEOUT)
    if (callerSignal?.aborted) throw new HttpTransportError("ABORTED", TRANSPORT_MESSAGES.ABORTED)
    throw new HttpTransportError("NETWORK", TRANSPORT_MESSAGES.NETWORK)
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener("abort", forward)
  }
}

/**
 * `fetch` through the pipeline. Resolves with the final Response (any status);
 * rejects only with an HttpTransportError.
 */
export async function authorizedFetch(url: string, options: RequestOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, auth = true, maxRetries = MAX_RETRIES, signal, ...init } = options
  const method = (init.method || "GET").toUpperCase()
  let refreshed = false

  for (let attempt = 0; ; attempt++) {
    const headers = new Headers(init.headers)
    // Names this client so the Access Profile's Web / Mobile choice is enforced server-side.
    if (!headers.has("X-Client-Platform")) headers.set("X-Client-Platform", "web")
    const token = auth ? getAccessToken() : null
    if (token) headers.set("Authorization", `Bearer ${token}`)

    const res = await fetchAttempt(url, { credentials: "include", ...init, method, headers }, timeoutMs, signal)

    if (res.status === 401 && auth && !refreshed) {
      refreshed = true
      const outcome = await refreshAccessToken()
      if (outcome === "ok") {
        attempt-- // the refresh retry does not count against the 429/5xx budget
        continue
      }
      if (outcome === "unavailable") {
        throw new HttpTransportError("NETWORK", TRANSPORT_MESSAGES.NETWORK)
      }
      return res // ended: the session is over and the auth context has been told
    }

    if (attempt < maxRetries && isRetryableStatus(res.status, method)) {
      const wait = retryAfterMs(res.headers) ?? backoffMs(attempt)
      await sleepImpl(wait, signal)
      continue
    }
    return res
  }
}

/**
 * A JSON call to the gateway. Never throws: the answer, or the reason there
 * was none, comes back as a value.
 */
export async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers)
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData
  // A FormData body sets its own multipart boundary — never override it.
  if (!isForm && !headers.has("Content-Type")) headers.set("Content-Type", "application/json")

  let response: Response
  try {
    response = await authorizedFetch(`${API_BASE_URL}${endpoint}`, { ...options, headers })
  } catch (err) {
    const e = err instanceof HttpTransportError ? err : new HttpTransportError("NETWORK", TRANSPORT_MESSAGES.NETWORK)
    return { status: 0, error: e.message, errorCode: e.code }
  }

  const data = await response.json().catch(() => null)

  if (response.status === 401 && options.auth !== false) {
    return {
      status: 401,
      error: (typeof data?.message === "string" && data.message) || "Session expired. Please log in again.",
      errorCode: typeof data?.code === "string" ? data.code : undefined,
    }
  }

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message
    return {
      status: response.status,
      error: message || "Request failed",
      // A refusal may carry a stable code and values to interpolate.
      errorCode: typeof data?.code === "string" ? data.code : undefined,
      errorParams: data?.params && typeof data.params === "object" ? data.params : undefined,
    }
  }

  return { status: response.status, data: data as T }
}

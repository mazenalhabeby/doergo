/** The HTTP client's configuration, options, hooks and the client's own shape. */
import type { AbortSignalLike, FetchInit, FetchLike, HeadersLike, HttpMethod } from '../transport';
import { ApiError } from '../api-error';
import type { Page, PageMeta } from '../envelope';
import type { Endpoint, EndpointArgs, EndpointBody, EndpointResult } from '../define';

// ── configuration ─────────────────────────────────────────────────────────────

/** What a refresh found out. Only `invalid` means the session is over. */
export type RefreshResult = 'refreshed' | 'invalid' | 'unreachable';

/**
 * Why the core is telling the app the session ended:
 * - `refresh-refused`: a 401, and the server refused the refresh too;
 * - `unauthorized`: a 401 in an app with no refresh at all (the admin console).
 */
export type SessionEndReason = 'refresh-refused' | 'unauthorized';

export interface RetryPolicy {
  /** Retries for 429 (any method) and 502/503/504 (GET/HEAD). 0 = never. */
  maxRetries: number;
  /** Extra tries for a GET/HEAD that reached nothing at all (not a timeout). */
  networkRetries: number;
  networkRetryDelayMs: number;
  /** Exponential backoff with jitter when the server gave no Retry-After. */
  backoffBaseMs: number;
  backoffCapMs: number;
  /** A Retry-After longer than this is cut to it — nobody waits a minute for a spinner. */
  retryAfterCapMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  networkRetries: 1,
  networkRetryDelayMs: 400,
  backoffBaseMs: 1_000,
  backoffCapMs: 10_000,
  retryAfterCapMs: 20_000,
};

/** What a response cache is asked about: one GET, for one session. */
export interface CacheRequest {
  method: 'GET';
  /** The path with its query string — the cache key. */
  path: string;
  /** The endpoint's own verdict (`endpoint({ keep })`), when the call came through one. */
  keep?: boolean;
  /** Whose answer this is (`config.sessionKey()`). */
  sessionKey: string | null;
}

/**
 * The phone's offline answers. `write` is told every successful GET (it decides
 * what to keep); `read` is asked only when NOTHING answered — never after a
 * refusal. Both may be async; neither can fail a request.
 */
export interface ResponseCacheHooks {
  read(req: CacheRequest): unknown | Promise<unknown>;
  write(req: CacheRequest, data: unknown): void | Promise<void>;
}

export interface ResponseObservation {
  method: HttpMethod;
  path: string;
  status: number;
  /** `X-Server-Time`, the anchor the phone checks offline timestamps against. */
  serverTime: string | null;
  headers: HeadersLike;
}

/** What every request tells the rest of an app, without the core knowing who listens. */
export interface ObserveHooks {
  /** Any answer at all — the network worked. */
  response?(o: ResponseObservation): void;
  /** Nothing answered, after every retry. */
  networkError?(o: { method: HttpMethod; path: string; kind: 'network' | 'timeout' }): void;
  /** A request is rejecting (not called for the caller's own cancel). */
  error?(e: ApiError, o: { method: HttpMethod; path: string }): void;
}

type MessageSource = string | (() => string);

export interface ApiClientConfig {
  /** The API base, e.g. `https://hbcfield.com/api/v1` or `/api/v1`. Asked per request. */
  baseUrl: () => string;
  /** The bearer token now, or null. May be async (SecureStore). */
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /**
   * Get a new token. Called single-flight by the core on a 401. Must answer, not
   * throw: `refreshed` (a new token is stored — `getToken` returns it),
   * `invalid` (the server refused: the session is over), `unreachable`
   * (no answer: keep the session). A throw is read as `unreachable`.
   */
  refresh?: () => Promise<RefreshResult>;
  /** The server said the session is over. Called once per request that learned it, and only when that request carried a token. */
  onSessionEnded?: (reason: SessionEndReason, error: ApiError) => void;
  /** Headers every request carries (platform, app version). */
  headers?: () => Record<string, string>;
  /** Defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** Per attempt. Default 30 s. */
  timeoutMs?: number;
  /** Per attempt for `upload`. Default 120 s. */
  uploadTimeoutMs?: number;
  retry?: Partial<RetryPolicy>;
  /** Merge identical GETs in flight (per `sessionKey`). Default false. */
  dedupeGets?: boolean;
  /** Who is asking — the user id the token belongs to. Keys GET merging and the cache. */
  sessionKey?: () => string | null | undefined;
  cache?: ResponseCacheHooks;
  observe?: ObserveHooks;
  /** `fetch`'s credentials mode — the web sends its httpOnly refresh cookie (`include`). */
  credentials?: FetchInit['credentials'];
  /** `fetch`'s cache mode (the admin console asks `no-store`). */
  fetchCache?: FetchInit['cache'];
  /** The sentences for failures that never reached a server — the phone passes translated ones. */
  messages?: Partial<Record<'network' | 'timeout' | 'aborted' | 'parse', MessageSource>>;
  /** @internal tests: make waits instant. */
  sleep?: (ms: number, signal?: AbortSignalLike) => Promise<void>;
  /** @internal tests: deterministic jitter. */
  random?: () => number;
  /** @internal tests: the clock Retry-After dates are read against. */
  now?: () => number;
}

/**
 * What a request resolves with:
 * - `data`     (default) the envelope's `data` — see envelope.ts;
 * - `page`     `{ data, meta }` — a list WITH its total;
 * - `raw`      the whole JSON body as the server sent it (the web's current
 *              `api.get` shape; the console's cursor pages `{ data, nextCursor }`);
 * - `response` `{ status, data, meta, body, headers }` — when the status matters.
 */
export type UnwrapMode = 'data' | 'page' | 'raw' | 'response';

export interface RequestOptions {
  /** Appended with `withQuery` (undefined / null / '' dropped, everything encoded). */
  query?: object | null;
  /** An object is sent as JSON; FormData / Blob / ArrayBuffer / URLSearchParams as they are; a string as JSON text. */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignalLike;
  timeoutMs?: number;
  /** Send the token and handle 401. Default true. False for sign-in: a 401 there is "wrong password". */
  auth?: boolean;
  /** Refresh-and-retry on a 401. Default true (a sign-out sets false). */
  refreshOn401?: boolean;
  /** false: no retries of any kind. An object overrides parts of the client's policy. */
  retry?: false | Partial<RetryPolicy>;
  /** Offline-cache verdict to pass to the cache hooks (set from `endpoint({ keep })`). */
  keep?: boolean;
  /** Use the response cache for this GET. Default true when the client has one. */
  cache?: boolean;
  /** Merge with an identical GET in flight. Default: the client's `dedupeGets` (never with a `signal`). */
  dedupe?: boolean;
  unwrap?: UnwrapMode;
}

/** `unwrap: 'response'`. */
export interface FullResponse<T> {
  status: number;
  data: T;
  meta: PageMeta | null;
  body: unknown;
  headers: HeadersLike;
}

/** Options for an endpoint call: the body travels here, typed by the endpoint. */
export type CallOptions<B> = Omit<RequestOptions, 'body' | 'keep'> & { body?: B };

/** The arguments `call` takes for an endpoint with path args `A` and body `B`. */
export type CallArgs<A, B> = void extends A ? [args?: A, opts?: CallOptions<B>] : [args: A, opts?: CallOptions<B>];

export interface ApiClient {
  request<T = unknown>(method: HttpMethod, path: string, opts?: RequestOptions): Promise<T>;
  get<T = unknown>(path: string, opts?: Omit<RequestOptions, 'body'>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  put<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  delete<T = unknown>(path: string, opts?: RequestOptions): Promise<T>;
  /** A multipart POST (avatar, cover) — no JSON content type, the long upload timeout, never retried. */
  upload<T = unknown>(path: string, form: unknown, opts?: RequestOptions): Promise<T>;
  /** A list with its `meta` (total, totalPages). Never merged and never answered from the cache. */
  page<T = unknown>(path: string, opts?: Omit<RequestOptions, 'body' | 'unwrap'>): Promise<Page<T>>;
  /** Call a defined endpoint: method, encoded path, offline verdict and auth all come from the definition. */
  call<D extends Endpoint<any, any, any>>(def: D, ...rest: CallArgs<EndpointArgs<D>, EndpointBody<D>>): Promise<EndpointResult<D>>;
  /** Forget every merged GET — on sign-out, before anything else. */
  clearInflight(): void;
}

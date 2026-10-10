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
 *       – 502 / 503 / 504 for GET and HEAD only — a POST that timed out at the
 *         proxy may still have been carried out;
 *       – one more try for a GET/HEAD that reached nothing: the first request
 *         after an app is reopened often fails on a stale connection pool;
 *   • GET de-duplication keyed by WHO is asking (`sessionKey`) and the path —
 *     keyed by path alone, an answer in flight when one member signed out was
 *     handed to the next member who asked for it;
 *   • an optional response cache (the phone's offline answers) consulted only
 *     when nothing answered — a refusal from the server is never masked;
 *   • failures as an `ApiError` with a `kind`, never a fake 500.
 *
 * ⚠️ The core never logs. Bodies, tokens and query strings stay out of every
 * error it builds; observers get the status and the server clock, nothing else.
 *
 * ⚠️ Only paths: a request for an absolute URL is refused, so a bearer token can
 * never be sent to a host that is not the API. Presigned S3 uploads/downloads
 * are the one thing an app fetches itself.
 */
import { ApiError, DEFAULT_TRANSPORT_MESSAGES, TRANSPORT_CODES, toApiError } from './api-error';
import { readBody, unwrapEnvelope, unwrapPage, envelopeMeta, type Page, type PageMeta } from './envelope';
import { withQuery } from './path';
import type { Endpoint, EndpointArgs, EndpointBody, EndpointResult } from './define';
import type { AbortSignalLike, FetchInit, FetchLike, HeadersLike, HttpMethod, ResponseLike } from './transport';

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

// ── helpers ───────────────────────────────────────────────────────────────────

const IDEMPOTENT = new Set<string>(['GET', 'HEAD']);

/** Should this answer be asked again, for this method? */
export function isRetryableStatus(status: number, method: string): boolean {
  if (status === 429) return true;
  return IDEMPOTENT.has(method.toUpperCase()) && (status === 502 || status === 503 || status === 504);
}

/**
 * Milliseconds the server asked us to wait, or null. Reads `Retry-After` and the
 * rate limiter's per-window variants (`Retry-After-short`, …), seconds or an
 * HTTP date, and takes the longest. Capped.
 */
export function retryAfterMs(headers: HeadersLike, now = Date.now(), capMs = DEFAULT_RETRY_POLICY.retryAfterCapMs): number | null {
  let best: number | null = null;
  const consider = (name: string, value: string | null) => {
    if (value == null || !/^retry-after(-|$)/i.test(name)) return;
    const secs = Number(value);
    let ms: number | null = null;
    if (value.trim() !== '' && Number.isFinite(secs)) ms = Math.max(0, secs * 1000);
    else {
      const at = Date.parse(value);
      if (!Number.isNaN(at)) ms = Math.max(0, at - now);
    }
    if (ms != null && (best == null || ms > best)) best = ms;
  };
  if (typeof headers.forEach === 'function') headers.forEach((value, name) => consider(name, value));
  else consider('retry-after', headers.get('retry-after'));
  return best == null ? null : Math.min(best, capMs);
}

function globalValue<T>(name: string): T | undefined {
  return (globalThis as unknown as Record<string, T | undefined>)[name];
}

function isInstance(value: unknown, ctorName: string): boolean {
  const ctor = globalValue<new (...args: never[]) => unknown>(ctorName);
  return typeof ctor === 'function' && value instanceof ctor;
}

/** A body the platform sends as it is (and that sets its own content type). */
function isPassThroughBody(body: unknown): boolean {
  if (body == null || typeof body !== 'object') return false;
  return (
    isInstance(body, 'FormData') ||
    isInstance(body, 'Blob') ||
    isInstance(body, 'ArrayBuffer') ||
    isInstance(body, 'URLSearchParams') ||
    ArrayBuffer.isView(body as ArrayBufferView)
  );
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}

const defaultSleep = (ms: number, signal?: AbortSignalLike) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

interface Exchange {
  status: number;
  body: unknown;
  headers: HeadersLike;
}

// ── the client ────────────────────────────────────────────────────────────────

export function createApiClient(config: ApiClientConfig): ApiClient {
  const policy: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...(config.retry ?? {}) };
  const timeoutMs = config.timeoutMs ?? 30_000;
  const uploadTimeoutMs = config.uploadTimeoutMs ?? 120_000;
  const sleep = config.sleep ?? defaultSleep;
  const random = config.random ?? Math.random;
  const now = config.now ?? (() => Date.now());
  const inflight = new Map<string, Promise<unknown>>();
  let refreshing: Promise<RefreshResult> | null = null;

  const fetchImpl = (): FetchLike => {
    const f = config.fetch ?? globalValue<FetchLike>('fetch');
    if (typeof f !== 'function') throw new Error('createApiClient: no fetch available — pass config.fetch');
    return f;
  };

  const message = (kind: 'network' | 'timeout' | 'aborted' | 'parse'): string => {
    const source = config.messages?.[kind];
    try {
      const text = typeof source === 'function' ? source() : source;
      if (text) return text;
    } catch {
      /* a translator that throws falls back to English */
    }
    return DEFAULT_TRANSPORT_MESSAGES[kind];
  };

  const transportError = (kind: 'network' | 'timeout' | 'aborted', code?: string) =>
    new ApiError(message(kind), { status: 0, kind, code: code ?? TRANSPORT_CODES[kind] });

  const sessionKey = (): string | null => {
    try {
      return config.sessionKey?.() ?? null;
    } catch {
      return null;
    }
  };

  /** One refresh at a time, shared by every request that met a 401 meanwhile. */
  const refreshOnce = (): Promise<RefreshResult> => {
    if (!config.refresh) return Promise.resolve('invalid');
    if (!refreshing) {
      const run = Promise.resolve()
        .then(() => config.refresh!())
        .then(
          (r): RefreshResult => (r === 'refreshed' || r === 'invalid' || r === 'unreachable' ? r : 'unreachable'),
          (): RefreshResult => 'unreachable',
        );
      refreshing = run;
      void run.finally(() => {
        if (refreshing === run) refreshing = null;
      });
    }
    return refreshing;
  };

  /** One attempt: resolves with the response (any status) or rejects with a transport ApiError. */
  const attempt = (url: string, init: FetchInit, ms: number, callerSignal?: AbortSignalLike): Promise<ResponseLike> =>
    new Promise<ResponseLike>((resolve, reject) => {
      if (callerSignal?.aborted) return reject(transportError('aborted'));
      const AC = globalValue<new () => { signal: AbortSignalLike; abort(): void }>('AbortController');
      const controller = typeof AC === 'function' ? new AC() : null;
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        callerSignal?.removeEventListener('abort', onAbort);
      };
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };
      const onAbort = () => {
        controller?.abort();
        settle(() => reject(transportError('aborted')));
      };
      const timer = setTimeout(() => {
        controller?.abort();
        settle(() => reject(transportError('timeout')));
      }, ms);
      callerSignal?.addEventListener('abort', onAbort, { once: true });
      let pending: Promise<ResponseLike>;
      try {
        pending = fetchImpl()(url, controller ? { ...init, signal: controller.signal } : init);
      } catch {
        return settle(() => reject(transportError('network')));
      }
      pending.then(
        (res) => settle(() => resolve(res)),
        () => settle(() => reject(transportError(callerSignal?.aborted ? 'aborted' : 'network'))),
      );
    });

  const observeResponse = (method: HttpMethod, p: string, res: ResponseLike) => {
    try {
      config.observe?.response?.({ method, path: p, status: res.status, serverTime: res.headers.get('x-server-time'), headers: res.headers });
    } catch {
      /* an observer must never break a request */
    }
  };

  const readError = async (res: ResponseLike): Promise<ApiError> => {
    const body = await readBody(res).catch(() => null);
    return toApiError(body, res.status);
  };

  /** The whole exchange: token, 401 → refresh → retry once, the retry policy. Resolves only on 2xx. */
  const exchange = async (method: HttpMethod, p: string, opts: RequestOptions, defaultTimeout: number): Promise<Exchange> => {
    const auth = opts.auth !== false;
    const retries: RetryPolicy | null = opts.retry === false ? null : { ...policy, ...(opts.retry ?? {}) };
    const idempotent = IDEMPOTENT.has(method);
    const url = `${config.baseUrl().replace(/\/+$/, '')}${p}`;
    let refreshed = false;
    let statusRetries = 0;
    let networkRetries = 0;

    for (;;) {
      const headers: Record<string, string> = { Accept: 'application/json', ...(config.headers?.() ?? {}), ...(opts.headers ?? {}) };
      let body: unknown;
      if (opts.body !== undefined) {
        if (isPassThroughBody(opts.body)) body = opts.body;
        else {
          if (!hasHeader(headers, 'Content-Type')) headers['Content-Type'] = 'application/json';
          body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
        }
      }
      const token = auth ? ((await config.getToken?.()) ?? null) : null;
      if (token) headers.Authorization = `Bearer ${token}`;

      const init: FetchInit = { method, headers, ...(body !== undefined ? { body } : {}) };
      if (config.credentials) init.credentials = config.credentials;
      if (config.fetchCache) init.cache = config.fetchCache;

      let res: ResponseLike;
      try {
        res = await attempt(url, init, opts.timeoutMs ?? defaultTimeout, opts.signal);
      } catch (err) {
        const e = err as ApiError;
        if (e.kind === 'network' && idempotent && retries && networkRetries < retries.networkRetries) {
          networkRetries++;
          await sleep(retries.networkRetryDelayMs, opts.signal).catch(() => {
            throw transportError('aborted');
          });
          continue;
        }
        if (e.kind === 'network' || e.kind === 'timeout') {
          try {
            config.observe?.networkError?.({ method, path: p, kind: e.kind });
          } catch {
            /* never breaks a request */
          }
        }
        throw e;
      }
      observeResponse(method, p, res);

      if (res.status === 401 && auth && opts.refreshOn401 !== false) {
        if (config.refresh && !refreshed) {
          refreshed = true;
          // Another request already refreshed while this one was in flight: just ask again.
          const current = (await config.getToken?.()) ?? null;
          if (token && current && current !== token) continue;
          const outcome = await refreshOnce();
          if (outcome === 'refreshed') continue;
          if (outcome === 'unreachable') {
            // Nothing is known about the session: it is kept, and this fails like no signal.
            throw transportError('network', TRANSPORT_CODES.sessionUnreachable);
          }
          const ended = await readError(res);
          const err = ended.code ? ended : new ApiError(ended.message, { status: 401, kind: 'http', code: TRANSPORT_CODES.sessionEnded });
          // A request that carried no token is a screen still asking after its session already ended.
          if (token) config.onSessionEnded?.('refresh-refused', err);
          throw err;
        }
        if (!config.refresh) {
          const err = await readError(res);
          if (token) config.onSessionEnded?.('unauthorized', err);
          throw err;
        }
      }

      if (!res.ok && retries && statusRetries < retries.maxRetries && isRetryableStatus(res.status, method)) {
        const wait =
          retryAfterMs(res.headers, now(), retries.retryAfterCapMs) ??
          (() => {
            const base = Math.min(retries.backoffCapMs, retries.backoffBaseMs * 2 ** statusRetries);
            return base / 2 + random() * (base / 2);
          })();
        statusRetries++;
        await sleep(wait, opts.signal).catch(() => {
          throw transportError('aborted');
        });
        continue;
      }

      if (!res.ok) throw await readError(res);

      let parsed: unknown;
      try {
        parsed = await readBody(res);
      } catch {
        throw new ApiError(message('parse'), { status: res.status, kind: 'parse', code: TRANSPORT_CODES.parse, retryable: false });
      }
      return { status: res.status, body: parsed, headers: res.headers };
    }
  };

  const shape = <T>(ex: Exchange, mode: UnwrapMode): T => {
    switch (mode) {
      case 'raw':
        return ex.body as T;
      case 'page':
        return unwrapPage(ex.body) as T;
      case 'response':
        return { status: ex.status, data: unwrapEnvelope(ex.body), meta: envelopeMeta(ex.body), body: ex.body, headers: ex.headers } as T;
      default:
        return unwrapEnvelope<T>(ex.body);
    }
  };

  const request = <T = unknown>(method: HttpMethod, rawPath: string, opts: RequestOptions = {}, defaultTimeout = timeoutMs): Promise<T> => {
    if (typeof rawPath !== 'string' || !rawPath.startsWith('/') || rawPath.startsWith('//')) {
      return Promise.reject(new TypeError('ApiClient: a request takes an API path starting with "/", never a URL'));
    }
    const p = withQuery(rawPath, opts.query);
    const mode: UnwrapMode = opts.unwrap ?? 'data';
    const isGet = method === 'GET';
    const useCache = isGet && !!config.cache && opts.cache !== false && mode === 'data';
    const cacheReq = (): CacheRequest => ({ method: 'GET', path: p, sessionKey: sessionKey(), ...(opts.keep !== undefined ? { keep: opts.keep } : {}) });

    const run = async (): Promise<T> => {
      try {
        const ex = await exchange(method, p, opts, defaultTimeout);
        const out = shape<T>(ex, mode);
        if (useCache) {
          try {
            void Promise.resolve(config.cache!.write(cacheReq(), out)).catch(() => undefined);
          } catch {
            /* a cache never fails the request it belongs to */
          }
        }
        return out;
      } catch (err) {
        if (useCache && err instanceof ApiError && (err.kind === 'network' || err.kind === 'timeout')) {
          try {
            const kept = await config.cache!.read(cacheReq());
            if (kept !== undefined) return kept as T;
          } catch {
            /* no kept answer */
          }
        }
        if (err instanceof ApiError && err.kind !== 'aborted') {
          try {
            config.observe?.error?.(err, { method, path: p });
          } catch {
            /* never breaks a request */
          }
        }
        throw err;
      }
    };

    const dedupe = isGet && !opts.signal && (opts.dedupe ?? !!config.dedupeGets);
    if (!dedupe) return run();
    const key = `${sessionKey() ?? '?'}|${mode}|${opts.auth === false ? 'anon' : 'auth'}|${p}`;
    const existing = inflight.get(key);
    if (existing) return existing as Promise<T>;
    const promise = run();
    inflight.set(key, promise);
    // `.finally()` makes a new promise that rejects when the request does; nobody awaits it.
    void promise
      .finally(() => {
        if (inflight.get(key) === promise) inflight.delete(key);
      })
      .catch(() => undefined);
    return promise;
  };

  const client: ApiClient = {
    request: (method, p, opts) => request(method, p, opts),
    get: (p, opts) => request('GET', p, opts),
    post: (p, body, opts) => request('POST', p, { ...opts, body }),
    put: (p, body, opts) => request('PUT', p, { ...opts, body }),
    patch: (p, body, opts) => request('PATCH', p, { ...opts, body }),
    delete: (p, opts) => request('DELETE', p, opts),
    upload: (p, form, opts) =>
      request('POST', p, { ...opts, body: form, retry: opts?.retry ?? { networkRetries: 0 } }, uploadTimeoutMs),
    page: (p, opts) => request('GET', p, { ...opts, unwrap: 'page', dedupe: false, cache: false }),
    call: <D extends Endpoint<any, any, any>>(def: D, ...rest: CallArgs<EndpointArgs<D>, EndpointBody<D>>): Promise<EndpointResult<D>> => {
      type R = EndpointResult<D>;
      const [args, opts] = rest as unknown as [EndpointArgs<D>, CallOptions<EndpointBody<D>> | undefined];
      let built: string;
      try {
        built = def.path(args);
      } catch (e) {
        return Promise.reject(e);
      }
      const keep = typeof def.keep === 'function' ? def.keep(args) : def.keep;
      const base: RequestOptions = { ...(opts ?? {}) };
      if (keep !== undefined) base.keep = keep;
      if (def.public) base.auth = false;
      if (def.upload) return client.upload<R>(built, opts?.body, base);
      return request<R>(def.method, built, base);
    },
    clearInflight: () => inflight.clear(),
  };
  return client;
}

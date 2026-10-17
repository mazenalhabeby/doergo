/** One request as a caller sees it: the path check, the answer's shape, the offline cache, GET merging. */
import type { HttpMethod } from '../transport';
import { ApiError } from '../api-error';
import { envelopeMeta, unwrapEnvelope, unwrapPage } from '../envelope';
import { withQuery } from '../path';
import type { Exchange } from './retry';
import type { CacheRequest, RequestOptions, UnwrapMode } from './types';
import type { ClientContext } from './context';

type ExchangeFn = (method: HttpMethod, p: string, opts: RequestOptions, defaultTimeout: number) => Promise<Exchange>;

export function shape<T>(ex: Exchange, mode: UnwrapMode): T {
  switch (mode) {
    case 'raw':
      return ex.body as T;
    case 'page':
      return unwrapPage(ex.body) as T;
    case 'response':
      return {
        status: ex.status,
        data: unwrapEnvelope(ex.body),
        meta: envelopeMeta(ex.body),
        body: ex.body,
        headers: ex.headers,
      } as T;
    default:
      return unwrapEnvelope<T>(ex.body);
  }
}

export function createRequest(ctx: ClientContext, exchange: ExchangeFn, inflight: Map<string, Promise<unknown>>) {
  const { config } = ctx;
  return <T = unknown>(
    method: HttpMethod,
    rawPath: string,
    opts: RequestOptions = {},
    defaultTimeout = ctx.timeoutMs,
  ): Promise<T> => {
    if (typeof rawPath !== 'string' || !rawPath.startsWith('/') || rawPath.startsWith('//')) {
      return Promise.reject(new TypeError('ApiClient: a request takes an API path starting with "/", never a URL'));
    }
    const p = withQuery(rawPath, opts.query);
    const mode: UnwrapMode = opts.unwrap ?? 'data';
    const isGet = method === 'GET';
    const useCache = isGet && !!config.cache && opts.cache !== false && mode === 'data';
    const cacheReq = (): CacheRequest => ({
      method: 'GET',
      path: p,
      sessionKey: ctx.sessionKey(),
      ...(opts.keep !== undefined ? { keep: opts.keep } : {}),
    });

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
    const key = `${ctx.sessionKey() ?? '?'}|${mode}|${opts.auth === false ? 'anon' : 'auth'}|${p}`;
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
}

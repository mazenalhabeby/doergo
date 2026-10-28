/** The whole exchange of one request: token, 401 → refresh → retry once, the retry policy. */
import type { FetchInit, HttpMethod, ResponseLike } from '../transport';
import { ApiError, TRANSPORT_CODES } from '../api-error';
import { readBody } from '../envelope';
import { IDEMPOTENT, hasHeader, isPassThroughBody, isRetryableStatus, retryAfterMs, type Exchange } from './retry';
import type { RequestOptions, RetryPolicy } from './types';
import { IDEMPOTENCY_HEADER, isMutating, outcomeUnknownStatus } from './request-id';
import type { ClientContext } from './context';

/** Headers and body for one attempt — the token is read again on every attempt. */
async function buildAttempt(
  ctx: ClientContext,
  method: HttpMethod,
  opts: RequestOptions,
  auth: boolean,
): Promise<{ init: FetchInit; token: string | null }> {
  const { config } = ctx;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(config.headers?.() ?? {}),
    ...(opts.headers ?? {}),
  };
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
  return { init, token };
}

/**
 * The one refresh after a 401. Resolves `true` to ask again; throws when the
 * session is over or cannot be checked.
 */
async function refreshAfter401(ctx: ClientContext, res: ResponseLike, token: string | null): Promise<true> {
  const { config } = ctx;
  // Another request already refreshed while this one was in flight: just ask again.
  const current = (await config.getToken?.()) ?? null;
  if (token && current && current !== token) return true;
  const outcome = await ctx.refreshOnce();
  if (outcome === 'refreshed') return true;
  if (outcome === 'unreachable') {
    // Nothing is known about the session: it is kept, and this fails like no signal.
    throw ctx.transportError('network', TRANSPORT_CODES.sessionUnreachable);
  }
  const ended = await ctx.readError(res);
  const err = ended.code
    ? ended
    : new ApiError(ended.message, { status: 401, kind: 'http', code: TRANSPORT_CODES.sessionEnded });
  // A request that carried no token is a screen still asking after its session already ended.
  if (token) config.onSessionEnded?.('refresh-refused', err);
  throw err;
}

/** How long to wait before asking again: the server's Retry-After, else jittered backoff. */
function statusRetryWait(ctx: ClientContext, res: ResponseLike, retries: RetryPolicy, statusRetries: number): number {
  return (
    retryAfterMs(res.headers, ctx.now(), retries.retryAfterCapMs) ??
    (() => {
      const base = Math.min(retries.backoffCapMs, retries.backoffBaseMs * 2 ** statusRetries);
      return base / 2 + ctx.random() * (base / 2);
    })()
  );
}

/** The whole exchange: token, 401 → refresh → retry once, the retry policy. Resolves only on 2xx. */
export function createExchange(ctx: ClientContext) {
  const { config } = ctx;
  return async (method: HttpMethod, p: string, given: RequestOptions, defaultTimeout: number): Promise<Exchange> => {
    const { opts, sig, key } = withRequestId(ctx, method, p, given);
    try {
      const done = await run(method, p, opts, defaultTimeout, key !== null);
      ctx.requestIds.forget(sig);
      return done;
    } catch (err) {
      if (key !== null && outcomeUnknown(err as ApiError)) ctx.requestIds.keep(sig, key);
      else ctx.requestIds.forget(sig);
      throw err;
    }
  };

  async function run(
    method: HttpMethod,
    p: string,
    opts: RequestOptions,
    defaultTimeout: number,
    keyed: boolean,
  ): Promise<Exchange> {
    const auth = opts.auth !== false;
    const retries: RetryPolicy | null = opts.retry === false ? null : { ...ctx.policy, ...(opts.retry ?? {}) };
    // A write with a key is safe to send again: the server answers a repeat with the first answer.
    const idempotent = IDEMPOTENT.has(method) || keyed;
    const url = `${config.baseUrl().replace(/\/+$/, '')}${p}`;
    let refreshed = false;
    let statusRetries = 0;
    let networkRetries = 0;

    for (;;) {
      const { init, token } = await buildAttempt(ctx, method, opts, auth);

      let res: ResponseLike;
      try {
        res = await ctx.attempt(url, init, opts.timeoutMs ?? defaultTimeout, opts.signal);
      } catch (err) {
        const e = err as ApiError;
        if (e.kind === 'network' && idempotent && retries && networkRetries < retries.networkRetries) {
          networkRetries++;
          await ctx.sleep(retries.networkRetryDelayMs, opts.signal).catch(() => {
            throw ctx.transportError('aborted');
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
      ctx.observeResponse(method, p, res);

      if (res.status === 401 && auth && opts.refreshOn401 !== false) {
        if (config.refresh && !refreshed) {
          refreshed = true;
          await refreshAfter401(ctx, res, token);
          continue;
        }
        if (!config.refresh) {
          const err = await ctx.readError(res);
          if (token) config.onSessionEnded?.('unauthorized', err);
          throw err;
        }
      }

      const retryable = isRetryableStatus(res.status, method) || (keyed && outcomeUnknownStatus(res.status));
      if (!res.ok && retries && statusRetries < retries.maxRetries && retryable) {
        const wait = statusRetryWait(ctx, res, retries, statusRetries);
        statusRetries++;
        await ctx.sleep(wait, opts.signal).catch(() => {
          throw ctx.transportError('aborted');
        });
        continue;
      }

      if (!res.ok) throw await ctx.readError(res);

      let parsed: unknown;
      try {
        parsed = await readBody(res);
      } catch {
        throw new ApiError(ctx.message('parse'), {
          status: res.status,
          kind: 'parse',
          code: TRANSPORT_CODES.parse,
          retryable: false,
        });
      }
      return { status: res.status, body: parsed, headers: res.headers };
    }
  }
}

/** The key this write carries, on every attempt — the remembered one when the same request's outcome is unknown. */
function withRequestId(ctx: ClientContext, method: HttpMethod, p: string, opts: RequestOptions) {
  const own = Object.entries(opts.headers ?? {}).find(([h]) => h.toLowerCase() === 'idempotency-key')?.[1];
  if (!isMutating(method) || opts.auth === false || opts.idempotencyKey === false) {
    return { opts, sig: null, key: own ?? null };
  }
  const sig = ctx.requestIds.signature(method, p, opts.body, ctx.sessionKey());
  const key = own ?? opts.idempotencyKey ?? ctx.requestIds.recall(sig) ?? ctx.newRequestId();
  return { opts: own ? opts : { ...opts, headers: { ...(opts.headers ?? {}), [IDEMPOTENCY_HEADER]: key } }, sig, key };
}

/** Nothing says whether the server did it: no answer, our timeout or cancel, or a gateway/proxy timeout. */
function outcomeUnknown(err: ApiError): boolean {
  if (err?.kind === 'network' || err?.kind === 'timeout' || err?.kind === 'aborted') return true;
  return err?.kind === 'http' && outcomeUnknownStatus(err.status);
}

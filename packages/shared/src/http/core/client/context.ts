/** What every step of one client shares: its settings, its words for transport failures, and the attempt itself. */
import type { AbortSignalLike, FetchInit, FetchLike, HttpMethod, ResponseLike } from '../transport';
import { ApiError, DEFAULT_TRANSPORT_MESSAGES, TRANSPORT_CODES, toApiError } from '../api-error';
import { readBody } from '../envelope';
import { defaultSleep, globalValue } from './retry';
import { createRequestIdMemory, newRequestId, type RequestIdMemory } from './request-id';
import { DEFAULT_RETRY_POLICY, type ApiClientConfig, type RefreshResult, type RetryPolicy } from './types';

export type TransportKind = 'network' | 'timeout' | 'aborted';

export interface ClientContext {
  config: ApiClientConfig;
  policy: RetryPolicy;
  timeoutMs: number;
  uploadTimeoutMs: number;
  sleep: NonNullable<ApiClientConfig['sleep']>;
  random: () => number;
  now: () => number;
  message: (kind: TransportKind | 'parse') => string;
  transportError: (kind: TransportKind, code?: string) => ApiError;
  sessionKey: () => string | null;
  refreshOnce: () => Promise<RefreshResult>;
  attempt: (url: string, init: FetchInit, ms: number, callerSignal?: AbortSignalLike) => Promise<ResponseLike>;
  observeResponse: (method: HttpMethod, p: string, res: ResponseLike) => void;
  readError: (res: ResponseLike) => Promise<ApiError>;
  /** A new Idempotency-Key, and the keys of writes whose outcome is unknown. */
  newRequestId: () => string;
  requestIds: RequestIdMemory;
}

export function createClientContext(config: ApiClientConfig): ClientContext {
  const fetchImpl = (): FetchLike => {
    const f = config.fetch ?? globalValue<FetchLike>('fetch');
    if (typeof f !== 'function') throw new Error('createApiClient: no fetch available — pass config.fetch');
    return f;
  };

  const message = (kind: TransportKind | 'parse'): string => {
    const source = config.messages?.[kind];
    try {
      const text = typeof source === 'function' ? source() : source;
      if (text) return text;
    } catch {
      /* a translator that throws falls back to English */
    }
    return DEFAULT_TRANSPORT_MESSAGES[kind];
  };

  const transportError = (kind: TransportKind, code?: string) =>
    new ApiError(message(kind), { status: 0, kind, code: code ?? TRANSPORT_CODES[kind] });

  const sessionKey = (): string | null => {
    try {
      return config.sessionKey?.() ?? null;
    } catch {
      return null;
    }
  };

  const observeResponse = (method: HttpMethod, p: string, res: ResponseLike) => {
    try {
      config.observe?.response?.({
        method,
        path: p,
        status: res.status,
        serverTime: res.headers.get('x-server-time'),
        headers: res.headers,
      });
    } catch {
      /* an observer must never break a request */
    }
  };

  const readError = async (res: ResponseLike): Promise<ApiError> => {
    const body = await readBody(res).catch(() => null);
    return toApiError(body, res.status);
  };

  const now = config.now ?? (() => Date.now());
  const random = config.random ?? Math.random;
  return {
    config,
    policy: { ...DEFAULT_RETRY_POLICY, ...(config.retry ?? {}) },
    timeoutMs: config.timeoutMs ?? 30_000,
    uploadTimeoutMs: config.uploadTimeoutMs ?? 120_000,
    sleep: config.sleep ?? defaultSleep,
    random,
    now,
    message,
    transportError,
    sessionKey,
    refreshOnce: createRefreshOnce(config),
    attempt: createAttempt(fetchImpl, transportError),
    observeResponse,
    readError,
    newRequestId: config.requestId ?? (() => newRequestId(random)),
    requestIds: createRequestIdMemory(now),
  };
}

/** One refresh at a time, shared by every request that met a 401 meanwhile. */
function createRefreshOnce(config: ApiClientConfig): () => Promise<RefreshResult> {
  let refreshing: Promise<RefreshResult> | null = null;
  return () => {
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
}

/** One attempt: resolves with the response (any status) or rejects with a transport ApiError. */
function createAttempt(fetchImpl: () => FetchLike, transportError: (kind: TransportKind) => ApiError) {
  return (url: string, init: FetchInit, ms: number, callerSignal?: AbortSignalLike): Promise<ResponseLike> =>
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
}

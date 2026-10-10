import { isApiError } from './api-error';

/**
 * The web's non-throwing shape — `{ status, data, error, errorCode, errorParams }`
 * — around a client promise, so lib/api.ts can move onto the shared client one
 * domain at a time without touching the ~420 `if (res.error) throw …` sites.
 *
 *   toResult(client.get('/tasks', { unwrap: 'raw' }))       // exactly today's `api.get` (whole body as data)
 *   toResult(client.call(tasksEndpoints.get, { id }))      // data unwrapped from its envelope
 *   toResult(client.get(p, { unwrap: 'response' }))        // the REAL status, not an assumed 200
 *
 * A failure that never reached a server keeps status 0 and the codes the web
 * already reads (NETWORK / TIMEOUT / ABORTED).
 */
export interface ApiResult<T> {
  status: number;
  data?: T;
  error?: string;
  errorCode?: string;
  errorParams?: Record<string, unknown>;
}

const FULL_RESPONSE_KEYS = ['status', 'data', 'meta', 'body', 'headers'];

function isFullResponse(v: unknown): v is { status: number; data: unknown } {
  return !!v && typeof v === 'object' && FULL_RESPONSE_KEYS.every((k) => k in (v as object)) && typeof (v as { status?: unknown }).status === 'number';
}

export async function toResult<T>(promise: Promise<T>, okStatus = 200): Promise<ApiResult<T>> {
  try {
    const value = await promise;
    if (isFullResponse(value)) return { status: value.status, data: value.data as T };
    return { status: okStatus, data: value };
  } catch (e) {
    if (isApiError(e)) {
      return {
        status: e.status,
        error: e.message,
        ...(e.code ? { errorCode: e.code } : {}),
        ...(e.params ? { errorParams: e.params } : {}),
      };
    }
    return { status: 0, error: e instanceof Error ? e.message : 'Request failed', errorCode: 'NETWORK' };
  }
}

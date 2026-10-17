/** When a request is retried, how long Retry-After says to wait, and the small body/header checks the client makes. */
import type { AbortSignalLike, HeadersLike } from '../transport';
import { DEFAULT_RETRY_POLICY } from './types';

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

export { IDEMPOTENT, globalValue, isPassThroughBody, hasHeader, defaultSleep, Exchange };

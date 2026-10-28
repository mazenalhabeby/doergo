/**
 * One ID per write, so a write that is sent twice happens once.
 *
 * The gateway remembers an `Idempotency-Key` per member for 7 days: the same key again gets the first answer and
 * runs nothing (gateway `common/idempotency/`). Every signed-in POST/PUT/PATCH/DELETE carries one, made here:
 *  - the same key on every attempt of one call (401 → refresh, 429, a resend after no answer);
 *  - when a call ends WITHOUT knowing whether the server did it (no answer, timeout, 408, 502–504), its key is kept
 *    for the same request, so the person tapping again — same action, same body — sends the SAME key and gets the
 *    first answer instead of a second job, comment or expense. Any real answer forgets it.
 */
import { globalValue, isPassThroughBody } from './retry';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** How long an "outcome unknown" key is kept for a tap again. The server keeps it 7 days. */
const UNKNOWN_OUTCOME_MS = 10 * 60_000;
const MAX_REMEMBERED = 100;

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/** Statuses that say nothing about whether the write happened. */
export function outcomeUnknownStatus(status: number): boolean {
  return status === 408 || status === 502 || status === 503 || status === 504;
}

export function isMutating(method: string): boolean {
  return MUTATING.has(method.toUpperCase());
}

/** JSON with sorted keys, so `{a,b}` and `{b,a}` are the same request (the gateway hashes the same way). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/** 32 URL-safe characters from the platform's secure random source (a weaker one only where none exists). */
export function newRequestId(random: () => number = Math.random): string {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const bytes = new Uint8Array(32);
  const crypto = globalValue<{ getRandomValues?: (a: Uint8Array) => Uint8Array }>('crypto');
  if (typeof crypto?.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(random() * 256);
  let out = '';
  for (const b of bytes) out += ALPHABET[b & 63];
  return out;
}

/** The keys of calls whose outcome is unknown, per request: method, path, body and who sent it. */
export function createRequestIdMemory(now: () => number) {
  const kept = new Map<string, { key: string; at: number }>();

  const signature = (method: string, path: string, body: unknown, session: string | null): string | null => {
    if (body !== undefined && isPassThroughBody(body)) return null;
    return `${session ?? ''}\n${method.toUpperCase()}\n${path}\n${body === undefined ? '' : stableStringify(body)}`;
  };

  return {
    signature,
    /** The key a call whose outcome is unknown used for this same request, if any. */
    recall(sig: string | null): string | null {
      if (!sig) return null;
      const hit = kept.get(sig);
      if (!hit) return null;
      if (now() - hit.at > UNKNOWN_OUTCOME_MS) {
        kept.delete(sig);
        return null;
      }
      return hit.key;
    },
    /** The call ended without knowing: keep its key for the same request. */
    keep(sig: string | null, key: string) {
      if (!sig) return;
      kept.delete(sig);
      kept.set(sig, { key, at: now() });
      while (kept.size > MAX_REMEMBERED) kept.delete(kept.keys().next().value as string);
    },
    /** The server answered: the next identical request is a new action. */
    forget(sig: string | null) {
      if (sig) kept.delete(sig);
    },
    clear() {
      kept.clear();
    },
  };
}

export type RequestIdMemory = ReturnType<typeof createRequestIdMemory>;

import { createHash, timingSafeEqual } from 'crypto';

/**
 * Compare two secrets without leaking, through timing, how much of one matched
 * — or how long the expected one is.
 *
 * NOT client-safe (node crypto): exported from the root entry only, never from
 * `client.ts`.
 *
 * ⚠️ Both sides are hashed to a fixed 32 bytes FIRST. `timingSafeEqual` throws
 * on unequal lengths, and every hand-rolled copy in this codebase either
 * pre-checked the length (which leaks it) or compared with `===` (which leaks
 * the matching prefix). One implementation, so the next secret check has
 * nothing to copy but this.
 *
 * An empty or missing EXPECTED value never matches anything — a gate whose
 * secret is unset must fail closed, not accept an empty header.
 */
export function safeEqual(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (typeof expected !== 'string' || expected.length === 0) return false;
  if (typeof provided !== 'string') return false;
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

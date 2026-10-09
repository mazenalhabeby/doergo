/**
 * A list's `limit` as a request carries it, made safe to hand to Prisma.
 *
 * `Number(query.limit)` alone is how a list grows unbounded: `?limit=1000000`
 * reads a whole table into one response, and `?limit=abc` is NaN, which Prisma
 * refuses with a 500. Every list that takes a limit asks here instead.
 *
 * `parsePaginationParams` is the paginated shape (page + limit, default 10, cap
 * 100); this is the bare limit for lists that already chose their own default.
 *
 *   clampListLimit(undefined)      → fallback
 *   clampListLimit('abc')          → fallback
 *   clampListLimit(0 | -5)         → 1
 *   clampListLimit(10_000)         → max (200)
 */
export const LIST_LIMIT_MAX = 200;

export function clampListLimit(
  raw: unknown,
  fallback = 50,
  max = LIST_LIMIT_MAX,
): number {
  if (raw === undefined || raw === null || raw === '') return Math.min(fallback, max);
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return Math.min(fallback, max);
  return Math.min(max, Math.max(1, n));
}

/** The page number beside it: a positive integer, anything else is page 1. */
export function clampListPage(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Run one request per item, at most `limit` in flight, and say what happened to
 * EACH of them.
 *
 * Bulk actions used to fire every request at once (`Promise.allSettled(ids.map…)`).
 * Thirty tasks is thirty simultaneous requests against a gateway that allows 3 a
 * second and 20 in ten; most came back 429 and the toast said "12 of 30 failed"
 * about work that was never refused on its merits. A small pool plus the API
 * client's own 429 handling (it waits for Retry-After) lets the whole batch land.
 */

/** The cap every bulk action uses. */
export const BULK_CONCURRENCY = 4

export type Settled<R> = PromiseSettledResult<R>

/** Results in the SAME order as `items`, whatever order they finished in. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Settled<R>[]> {
  const results: Settled<R>[] = new Array(items.length)
  const width = Math.max(1, Math.min(Math.floor(limit) || 1, items.length))
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) }
      } catch (reason) {
        results[i] = { status: "rejected", reason }
      }
    }
  }
  await Promise.all(Array.from({ length: width }, worker))
  return results
}

/**
 * How many did not succeed. A request that RESOLVES with an error body (the
 * client's `{ error }` shape, for API helpers that do not throw) is a failure too.
 */
export function isFailure<R>(r: Settled<R>): boolean {
  if (r.status === "rejected") return true
  const v = r.value as unknown
  return !!v && typeof v === "object" && "error" in v && !!(v as { error?: unknown }).error
}

export function countFailures<R>(results: Settled<R>[]): number {
  return results.filter(isFailure).length
}

/** The reason of the first failure, for a single-item action that shows the server's own sentence. */
export function firstFailureReason<R>(results: Settled<R>[]): unknown {
  const r = results.find(isFailure)
  if (!r) return undefined
  return r.status === "rejected" ? r.reason : (r.value as { error?: unknown }).error
}

/** Run the bulk action at the shared cap and return what the toast needs. */
export async function runBulk<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number = BULK_CONCURRENCY,
): Promise<{ results: Settled<R>[]; failed: number; total: number }> {
  const results = await mapWithConcurrency(items, limit, fn)
  return { results, failed: countFailures(results), total: items.length }
}

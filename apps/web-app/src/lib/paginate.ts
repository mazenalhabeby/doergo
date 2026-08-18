/**
 * Fetch every page of a paginated list endpoint.
 *
 * Our list endpoints all answer `{ data, meta: { page, limit, total, totalPages } }`
 * and cap `limit` server-side (members 200, spaces 500, …). A caller that just
 * asks for one page silently truncates once an org outgrows that cap — the list
 * looks complete and simply misses rows.
 *
 * Page 1 is fetched first because only its `meta` says how many pages exist; any
 * remaining pages then go out CONCURRENTLY, so the common case (one page) costs
 * exactly one request and the rare large org costs one round-trip, not N.
 *
 * `maxPages` is a runaway guard, not a product limit — a server that reports a
 * nonsense `totalPages` can't spin this into thousands of requests.
 */
export interface PagedResponse<T> {
  data?: T[]
  meta?: { totalPages?: number }
}

export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<PagedResponse<T> | undefined>,
  opts: { maxPages?: number } = {},
): Promise<T[]> {
  const maxPages = opts.maxPages ?? 20

  const first = await fetchPage(1)
  const items = first?.data ?? []

  const totalPages = Math.min(first?.meta?.totalPages ?? 1, maxPages)
  if (totalPages <= 1) return items

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => fetchPage(i + 2)),
  )

  return [...items, ...rest.flatMap((page) => page?.data ?? [])]
}

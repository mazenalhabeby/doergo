import { fetchAllPages } from '../paginate'

/**
 * Single-page callers silently truncated once an org outgrew a list endpoint's
 * cap — the spaces grid stopped at 20. These pin the contract: everything is
 * returned, the common case costs one request, and a bad totalPages can't spin.
 */

describe('fetchAllPages', () => {
  it('makes exactly one request when there is a single page', async () => {
    const fetchPage = jest.fn().mockResolvedValue({ data: [1, 2], meta: { totalPages: 1 } })
    await expect(fetchAllPages(fetchPage)).resolves.toEqual([1, 2])
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('returns every page, in order', async () => {
    const pages: Record<number, unknown> = {
      1: { data: ['a'], meta: { totalPages: 3 } },
      2: { data: ['b'], meta: { totalPages: 3 } },
      3: { data: ['c'], meta: { totalPages: 3 } },
    }
    const fetchPage = jest.fn(async (page: number) => pages[page] as never)
    await expect(fetchAllPages(fetchPage)).resolves.toEqual(['a', 'b', 'c'])
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })

  it('requests pages 2..n concurrently, not one after another', async () => {
    let inFlight = 0
    let peak = 0
    const fetchPage = jest.fn(async (page: number) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return { data: [page], meta: { totalPages: 4 } }
    })
    await fetchAllPages(fetchPage)
    // Page 1 must resolve alone (it reveals the count); the rest overlap.
    expect(peak).toBeGreaterThan(1)
  })

  it('treats a missing meta as a single page', async () => {
    const fetchPage = jest.fn().mockResolvedValue({ data: ['only'] })
    await expect(fetchAllPages(fetchPage)).resolves.toEqual(['only'])
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('survives an empty or undefined response', async () => {
    await expect(fetchAllPages(async () => undefined)).resolves.toEqual([])
    await expect(fetchAllPages(async () => ({}))).resolves.toEqual([])
  })

  it('caps runaway page counts rather than issuing thousands of requests', async () => {
    const fetchPage = jest.fn(async () => ({ data: ['x'], meta: { totalPages: 99999 } }))
    const out = await fetchAllPages(fetchPage, { maxPages: 3 })
    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(out).toHaveLength(3)
  })
})

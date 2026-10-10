import { BULK_CONCURRENCY, countFailures, mapWithConcurrency, runBulk } from "@/lib/concurrency"

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("mapWithConcurrency", () => {
  it("never has more than the limit in flight, and finishes every item", async () => {
    let inFlight = 0
    let peak = 0
    const items = Array.from({ length: 30 }, (_, i) => i)
    const results = await mapWithConcurrency(items, 4, async (i) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await tick(1 + (i % 3))
      inFlight--
      return i * 2
    })
    expect(peak).toBe(4)
    expect(results).toHaveLength(30)
    expect(results.every((r) => r.status === "fulfilled")).toBe(true)
  })

  it("returns results in the order of the items, not the order they finished", async () => {
    const results = await mapWithConcurrency([30, 1, 10], 3, async (ms) => {
      await tick(ms)
      return ms
    })
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([30, 1, 10])
  })

  it("one failure does not stop the rest and is reported for its own item", async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      if (n === 2) throw new Error("refused")
      return n
    })
    expect(results[1]).toEqual({ status: "rejected", reason: expect.any(Error) })
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4)
  })

  it("an empty list is no work", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([])
  })
})

describe("runBulk", () => {
  it("uses the shared cap of 4", async () => {
    expect(BULK_CONCURRENCY).toBe(4)
    let inFlight = 0
    let peak = 0
    await runBulk(Array.from({ length: 12 }, (_, i) => i), async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await tick(2)
      inFlight--
    })
    expect(peak).toBe(4)
  })

  it("counts rejections AND resolved error bodies as failures", async () => {
    const { failed, total } = await runBulk([1, 2, 3, 4], async (n) => {
      if (n === 1) throw new Error("x")
      if (n === 2) return { error: "Too many requests", status: 429 }
      return { data: n }
    })
    expect(total).toBe(4)
    expect(failed).toBe(2)
    expect(countFailures([{ status: "fulfilled", value: { error: "" } }])).toBe(0)
  })
})

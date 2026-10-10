import { createDeferredGate, waveStarted, DEFERRED_WAVE_GAP_MS } from "../deferred-start"

/**
 * The gate that holds the shell's background reads until the page has loaded.
 */
function harness(initialBusy = false) {
  let busy = initialBusy
  const subs = new Set<() => void>()
  const idleQueue: (() => void)[] = []
  const gate = createDeferredGate({
    minDelayMs: 1000,
    maxDelayMs: 4000,
    isBusy: () => busy,
    subscribeBusy: (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    whenIdle: (fn) => idleQueue.push(fn),
  })
  return {
    gate,
    subs,
    setBusy(v: boolean) {
      busy = v
      subs.forEach((s) => s())
    },
    flushIdle() {
      idleQueue.splice(0).forEach((f) => f())
    },
  }
}

describe("deferred start gate", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("is closed before start and stays closed without it", () => {
    const h = harness()
    jest.advanceTimersByTime(10_000)
    expect(h.gate.isOpen()).toBe(false)
  })

  it("opens after the minimum delay on the next idle tick when nothing is loading", () => {
    const h = harness()
    const listener = jest.fn()
    h.gate.subscribe(listener)
    h.gate.start()
    jest.advanceTimersByTime(999)
    h.flushIdle()
    expect(h.gate.isOpen()).toBe(false)
    jest.advanceTimersByTime(1)
    expect(h.gate.isOpen()).toBe(false) // waits for idle
    h.flushIdle()
    expect(h.gate.isOpen()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("waits for the page's own requests to settle", () => {
    const h = harness(true)
    h.gate.start()
    jest.advanceTimersByTime(1500)
    h.flushIdle()
    expect(h.gate.isOpen()).toBe(false)
    h.setBusy(false)
    h.flushIdle()
    expect(h.gate.isOpen()).toBe(true)
  })

  it("does not open if a request started between the check and the idle tick", () => {
    const h = harness()
    h.gate.start()
    jest.advanceTimersByTime(1000)
    // idle callback is queued; something starts loading before it runs
    h.setBusy(true)
    h.flushIdle()
    expect(h.gate.isOpen()).toBe(false)
    h.setBusy(false)
    h.flushIdle()
    expect(h.gate.isOpen()).toBe(true)
  })

  it("opens at the maximum delay even if the page keeps fetching", () => {
    const h = harness(true)
    h.gate.start()
    jest.advanceTimersByTime(3999)
    expect(h.gate.isOpen()).toBe(false)
    jest.advanceTimersByTime(1)
    expect(h.gate.isOpen()).toBe(true)
  })

  it("starts once, stays open, and lets go of the busy signal", () => {
    const h = harness()
    h.gate.start()
    h.gate.start()
    jest.advanceTimersByTime(1000)
    h.flushIdle()
    expect(h.gate.isOpen()).toBe(true)
    expect(h.subs.size).toBe(0)
    h.setBusy(true)
    h.gate.start()
    jest.advanceTimersByTime(10_000)
    expect(h.gate.isOpen()).toBe(true)
  })

  it("unsubscribed listeners are not called", () => {
    const h = harness()
    const listener = jest.fn()
    const off = h.gate.subscribe(listener)
    off()
    h.gate.start()
    jest.advanceTimersByTime(4000)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe("waves after the gate", () => {
  it("records when it opened and starts each wave a gap later", () => {
    let t = 1000
    const gate = createDeferredGate({
      minDelayMs: 0,
      maxDelayMs: 10,
      isBusy: () => true,
      subscribeBusy: () => () => {},
      now: () => t,
    })
    expect(gate.openedAt()).toBeNull()
    jest.useFakeTimers()
    gate.start()
    t = 5000
    jest.advanceTimersByTime(10)
    jest.useRealTimers()
    expect(gate.openedAt()).toBe(5000)
    expect(waveStarted(0, null)).toBe(false)
    expect(waveStarted(0, 0)).toBe(true)
    expect(waveStarted(1, DEFERRED_WAVE_GAP_MS - 1)).toBe(false)
    expect(waveStarted(1, DEFERRED_WAVE_GAP_MS)).toBe(true)
    expect(waveStarted(2, 2 * DEFERRED_WAVE_GAP_MS - 1)).toBe(false)
  })
})

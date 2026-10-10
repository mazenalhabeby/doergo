/**
 * "After the page has loaded" — one gate for every read the first paint does not need.
 *
 * A page load used to fire everything at once: the page's own data AND the
 * shell's badge counts (bell, chat, support, documents), the billing ribbon and
 * the clock-in site list — 15 to 30 requests in the same instant, which met the
 * gateway's per-second limit and cost the page a second of retries. Those reads
 * are real, but none of them is what the person came to the page to see.
 *
 * The gate opens ONCE per app session, when BOTH:
 *  - `minDelayMs` has passed since the first consumer mounted (the page's own
 *    burst is out of the way), and
 *  - nothing is fetching (`isBusy`), then on the next idle tick;
 * or at `maxDelayMs` regardless, so a page that keeps polling cannot starve it.
 * After that it stays open: a client-side navigation never waits again.
 *
 * Pure (timers and the busy signal are injected) so the timing is testable;
 * `hooks/use-after-first-load.ts` binds it to React Query.
 */

export interface DeferredGateOptions {
  minDelayMs: number
  maxDelayMs: number
  /** Is anything still loading? (React Query: `isFetching() > 0`.) */
  isBusy: () => boolean
  /** Called back whenever `isBusy` may have changed. Returns an unsubscribe. */
  subscribeBusy: (onChange: () => void) => () => void
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  /** Run `fn` when the main thread is idle (requestIdleCallback where it exists). */
  whenIdle?: (fn: () => void) => void
  now?: () => number
}

export interface DeferredGate {
  /** Start the clock — idempotent; the first call wins. */
  start: () => void
  isOpen: () => boolean
  /** When it opened (`now()`), or null while closed — for the later waves. */
  openedAt: () => number | null
  subscribe: (listener: () => void) => () => void
}

export const DEFERRED_MIN_DELAY_MS = 1200
export const DEFERRED_MAX_DELAY_MS = 4000

/**
 * The deferred reads go out in WAVES this far apart, so the gate opening is not
 * itself a burst: 0 — what the chrome shows (bell, chat, billing ribbon); 1 —
 * the support launcher and the documents count; 2 — what only matters on a tap
 * or further down a page.
 */
export const DEFERRED_WAVE_GAP_MS = 600
export type DeferredWave = 0 | 1 | 2

/** Has `wave` started, `elapsedSinceOpen` ms after the gate opened? */
export function waveStarted(wave: DeferredWave, elapsedSinceOpen: number | null): boolean {
  if (elapsedSinceOpen === null) return false
  return elapsedSinceOpen >= wave * DEFERRED_WAVE_GAP_MS
}

function defaultWhenIdle(fn: () => void) {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => unknown })
    .requestIdleCallback
  if (typeof ric === "function") ric(fn, { timeout: 300 })
  else setTimeout(fn, 0)
}

export function createDeferredGate(opts: DeferredGateOptions): DeferredGate {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const whenIdle = opts.whenIdle ?? defaultWhenIdle
  const now = opts.now ?? (() => Date.now())
  let openedAt: number | null = null

  let state: "idle" | "waiting" | "open" = "idle"
  let minPassed = false
  let idleQueued = false
  let unsubscribeBusy: (() => void) | null = null
  const timers: unknown[] = []
  const listeners = new Set<() => void>()

  const open = () => {
    if (state === "open") return
    state = "open"
    openedAt = now()
    unsubscribeBusy?.()
    unsubscribeBusy = null
    timers.forEach(clearTimer)
    timers.length = 0
    listeners.forEach((l) => l())
  }

  const check = () => {
    if (state !== "waiting" || !minPassed || idleQueued || opts.isBusy()) return
    idleQueued = true
    whenIdle(() => {
      idleQueued = false
      // Something may have started in the meantime — wait for the next change.
      if (opts.isBusy()) return
      open()
    })
  }

  return {
    start() {
      if (state !== "idle") return
      state = "waiting"
      unsubscribeBusy = opts.subscribeBusy(check)
      timers.push(
        setTimer(() => {
          minPassed = true
          check()
        }, opts.minDelayMs),
      )
      timers.push(setTimer(open, opts.maxDelayMs))
    },
    isOpen: () => state === "open",
    openedAt: () => openedAt,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

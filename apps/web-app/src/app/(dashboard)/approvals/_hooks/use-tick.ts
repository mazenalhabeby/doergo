"use client"

import { useEffect, useState } from "react"

/** One clock per period, shared: every "… ago" on the page moves on the same beat, so two never disagree. */
const clocks = new Map<number, { id: number; listeners: Set<() => void> }>()

function subscribe(ms: number, fn: () => void): () => void {
  let clock = clocks.get(ms)
  if (!clock) {
    const listeners = new Set<() => void>()
    clock = { id: window.setInterval(() => listeners.forEach((l) => l()), ms), listeners }
    clocks.set(ms, clock)
  }
  clock.listeners.add(fn)
  return () => {
    const c = clocks.get(ms)
    if (!c) return
    c.listeners.delete(fn)
    if (c.listeners.size === 0) {
      window.clearInterval(c.id)
      clocks.delete(ms)
    }
  }
}

/**
 * Re-draws the caller every `ms` (30 s by default), so a time said relative to now ("Updated 2 minutes ago",
 * "the list as it was 5 minutes ago") keeps counting while the page stays open instead of freezing. Every caller
 * with the same period ticks together. `active: false` stops it (nothing relative on screen right now).
 */
export function useTick(ms = 30_000, active = true) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    return subscribe(ms, () => setTick((n) => n + 1))
  }, [ms, active])
}

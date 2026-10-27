"use client"

import { useEffect, useState } from "react"

/**
 * Re-draws the caller every `ms` (30 s by default), so a time said relative to now ("Updated 2 minutes ago",
 * "the list as it was 5 minutes ago") keeps counting while the page stays open instead of freezing.
 */
export function useTick(ms = 30_000) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), ms)
    return () => window.clearInterval(id)
  }, [ms])
}

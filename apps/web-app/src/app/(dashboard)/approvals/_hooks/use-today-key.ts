"use client"

import { useEffect, useState } from "react"
import { localDateKey } from "@hbcfield/shared/client"

/**
 * Today on this device's calendar (the shared day key), read again when the page comes back into view and once a
 * minute — a tab left open overnight would otherwise go on offering yesterday.
 */
export function useTodayKey(): string {
  const [today, setToday] = useState(() => localDateKey())
  useEffect(() => {
    const check = () => setToday(localDateKey())
    window.addEventListener("focus", check)
    document.addEventListener("visibilitychange", check)
    const timer = window.setInterval(check, 60_000)
    return () => {
      window.removeEventListener("focus", check)
      document.removeEventListener("visibilitychange", check)
      window.clearInterval(timer)
    }
  }, [])
  return today
}

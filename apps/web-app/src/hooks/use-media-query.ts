"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Whether a media query matches, live. False on the server (and during hydration), then the real answer — use it
 * to avoid MOUNTING what a breakpoint hides, not to lay things out (CSS does that).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

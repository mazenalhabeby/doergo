"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * The ONE debounce for the web app. Two shapes of the same idea:
 *
 * - `useDebouncedValue` — a value that settles instead of changing on every
 *   keystroke. Search inputs feed a query key: typing "boiler" without this
 *   fires six requests and shows five sets of results the user never asked for.
 *   The input itself stays instant — only the settled value drives the fetch.
 *
 * - `useDebouncedCallback` — a function that runs once the calls stop (an
 *   autosave). The pending call is dropped on unmount.
 *
 * Hand-rolled `setTimeout` copies drifted (250/300/350 ms, some trimmed, some
 * reset paging in the timer); new code reaches for these instead.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])

  return settled
}

export function useDebouncedCallback(callback: () => void, delayMs = 300): () => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debounced = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(callback, delayMs)
  }, [callback, delayMs])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return debounced
}

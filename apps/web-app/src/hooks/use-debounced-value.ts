"use client"

import { useEffect, useState } from "react"

/**
 * A value that settles instead of changing on every keystroke.
 *
 * Search inputs feed a query key: typing "boiler" without this fires six
 * requests and shows five sets of results the user never asked for. The input
 * itself stays instant — only the settled value drives the fetch.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])

  return settled
}

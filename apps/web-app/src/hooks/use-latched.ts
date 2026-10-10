"use client"

import { useState } from "react"

/**
 * `true` from the first time `value` is true, for as long as the component lives.
 *
 * For a lazily loaded dialog: mount it (and so download it) only once somebody
 * opens it, then keep it mounted so its closing animation still plays.
 */
export function useLatched(value: boolean): boolean {
  const [latched, setLatched] = useState(value)
  // Derived state, set during render — React re-renders once, without an effect's extra frame.
  if (value && !latched) setLatched(true)
  return latched || value
}

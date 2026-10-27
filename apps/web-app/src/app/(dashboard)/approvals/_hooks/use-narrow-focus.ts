"use client"

import { useEffect, useRef } from "react"
import { focusRow } from "./use-arrow-walk"

/** The panel's Back button (drawn on narrow screens only) — where the focus goes when something opens there. */
export const BACK_BUTTON_ID = "approvals-back"

/**
 * A narrow screen (a phone, an iPad with a keyboard) shows one column at a time: choosing a row hides the list,
 * and with it the focus. The focus goes to the panel's Back button when something opens, and back to the row it
 * came from when the panel closes — never left on the page itself. A wide screen shows both: nothing moves.
 */
export function useNarrowFocus(selected: string | null) {
  const prev = useRef(selected)
  useEffect(() => {
    const was = prev.current
    prev.current = selected
    if (was === selected || window.matchMedia("(min-width: 1024px)").matches) return
    if (selected) requestAnimationFrame(() => document.getElementById(BACK_BUTTON_ID)?.focus())
    else if (was) focusRow(was)
  }, [selected])
}

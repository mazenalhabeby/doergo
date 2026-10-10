"use client"

import { useEffect, useState } from "react"
import { DEFAULT_LINE_STYLE, LINE_STYLE_KEY, readLineStyle, type LineStyle } from "./draft-model"

/** How much a labour line's description says — remembered for the next invoice. */
export function useLineStyle() {
  const [lineStyle, setLineStyleState] = useState<LineStyle>(DEFAULT_LINE_STYLE)
  // Read after mount: the server render has no storage, and both renders must match.
  useEffect(() => { setLineStyleState(readLineStyle()) }, [])
  const setLineStyle = (patch: Partial<LineStyle>) =>
    setLineStyleState((prev) => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(LINE_STYLE_KEY, JSON.stringify(next)) } catch { /* private window: not remembered, still applied */ }
      return next
    })
  return { lineStyle, setLineStyle }
}

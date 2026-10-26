"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const KEY = "hbcfield-sidebar-collapsed"

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

/**
 * Open or collapsed (the 76px rail), remembered on this browser; "[" toggles it (not while typing). When
 * collapsed, hovering or focusing the rail PEEKS — the full menu floats over the page without moving it —
 * after a short delay so a pointer passing by does not flash it open.
 */
export function useSidebarState() {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed)
  const [peek, setPeek] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toggle = useCallback(() => {
    setPeek(false)
    setCollapsed((c) => {
      try {
        localStorage.setItem(KEY, c ? "0" : "1")
      } catch {
        /* private window: the choice lasts this page only */
      }
      return !c
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggle])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const schedule = useCallback((open: boolean, ms: number) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setPeek(open), ms)
  }, [])

  return {
    collapsed,
    /** Collapsed, but floating open over the page right now. */
    peeking: collapsed && peek,
    toggle,
    peekIn: useCallback(() => schedule(true, 140), [schedule]),
    peekOut: useCallback(() => schedule(false, 220), [schedule]),
  }
}

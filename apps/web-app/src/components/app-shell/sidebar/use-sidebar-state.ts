"use client"

import { useCallback, useEffect, useState } from "react"

const KEY = "hbcfield-sidebar-collapsed"

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

/**
 * Open or collapsed (the 76px rail), remembered on this browser; "[" toggles it (not while typing).
 *
 * ⚠️ The rail does NOT open on hover (2026-10-26). It used to "peek" after 140 ms, and the left edge is where
 * the pointer passes all day (the back button, a scrollbar, the page's own left column) — every pass opened
 * it and ran the animation for nobody. Collapsed means collapsed; each icon names itself in a tooltip.
 */
export function useSidebarState() {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed)

  const toggle = useCallback(() => {
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

  return { collapsed, toggle }
}

"use client"

import { useLayoutEffect } from "react"

/**
 * Puts the app's design tokens on the page (`html.app-theme` in globals.css) while the dashboard is mounted, and
 * takes them off when it leaves — the public site and the sign-in keep their own. On <html>, not on a wrapper,
 * so dialogs, menus and toasts (portals under <body>) get them too.
 */
export function useAppTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.add("app-theme")
    return () => root.classList.remove("app-theme")
  }, [])
}

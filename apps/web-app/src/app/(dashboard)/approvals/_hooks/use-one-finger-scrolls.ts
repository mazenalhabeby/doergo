"use client"

import { useEffect, useRef } from "react"

/**
 * On a phone, ONE finger scrolls the page and two move the canvas — a canvas that took every touch was a wall the
 * page could not be scrolled past. The pane lets the browser scroll vertically (its library style forbids every
 * touch gesture), and a lone finger's touchstart never reaches the pan handler; a tap still opens a node (a click).
 */
const PHONE = "(max-width: 767px)"
export function useOneFingerScrolls() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const phone = window.matchMedia(PHONE)
    // The pane is the library's child, already in the page when this runs (a child commits before its parent).
    const pane = el.querySelector<HTMLElement>(".react-flow__pane")
    const fit = () => pane && (pane.style.touchAction = phone.matches ? "pan-y" : "")
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length < 2 && phone.matches) e.stopPropagation()
    }
    fit()
    phone.addEventListener("change", fit)
    el.addEventListener("touchstart", onTouch, { capture: true, passive: true })
    return () => {
      phone.removeEventListener("change", fit)
      el.removeEventListener("touchstart", onTouch, { capture: true })
    }
  }, [])
  return ref
}

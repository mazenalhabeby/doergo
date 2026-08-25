"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

export interface OverflowNavItem {
  label: string
  href: string
}

/**
 * Priority+ navigation: show as many top-level items as actually fit, and put the
 * rest behind a "More" menu.
 *
 * The navbar carries up to eleven items whose labels are written by translators,
 * not by us. "Customer Invoices" is 17 characters in English and "Facturas de
 * clientes" is 20; "Duty Roster" is "Turni di servizio" in Italian. Any fixed
 * breakpoint is therefore wrong in at least one language, and the previous
 * approaches both failed visibly: overflowing the flex row pushed items under the
 * search box, and scrolling the row clipped a label mid-word with no affordance
 * that anything was there.
 *
 * So it is measured rather than guessed. Widths are read from the DOM, which
 * means this adapts to language, font loading and zoom without anyone maintaining
 * a table of breakpoints.
 *
 * Two details that matter:
 *  - The ACTIVE item is never hidden. Being on a page whose nav entry has
 *    collapsed is exactly when you need to see where you are.
 *  - Measuring happens with every item temporarily visible, inside
 *    useLayoutEffect, so the browser never paints the intermediate state.
 */
export function useOverflowNav(revision: unknown) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(Number.POSITIVE_INFINITY)
  const [overflow, setOverflow] = useState<OverflowNavItem[]>([])

  const measure = useCallback(() => {
    const el = containerRef.current
    if (!el) return

    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-nav-item]"))
    if (!items.length) return

    // Measure with everything shown, so a hidden item still reports a real width.
    const previous = items.map((i) => i.style.display)
    items.forEach((i) => { i.style.display = "" })
    const more = el.querySelector<HTMLElement>("[data-nav-more]")
    const moreWidth = more ? more.offsetWidth : 44

    const gap = 4 // matches gap-1
    const available = el.clientWidth
    const widths = items.map((i) => i.offsetWidth + gap)
    const activeIndex = items.findIndex((i) => i.dataset.navActive === "true")

    const total = widths.reduce((a, b) => a + b, 0)
    let count = items.length
    if (total > available) {
      let used = moreWidth + gap
      count = 0
      for (const w of widths) {
        if (used + w > available) break
        used += w
        count++
      }
      // Never collapse the page the user is currently on.
      if (activeIndex >= count && count > 0) count = activeIndex + 1
    }

    // Apply visibility here rather than through React state. The alternative is
    // threading an index into every conditionally-rendered nav child, which the
    // `show*` permission flags make error-prone: the index of "Reports" differs
    // per user. Nothing else controls `display` on these nodes, so React and this
    // never fight over them.
    items.forEach((i, idx) => { i.style.display = idx < count ? "" : "none" })
    void previous

    setVisibleCount(count)
    setOverflow(
      count >= items.length
        ? []
        : items.slice(count).map((i) => ({
            label: i.dataset.navLabel ?? "",
            href: i.dataset.navHref ?? "#",
          })),
    )
  }, [])

  useLayoutEffect(() => { measure() }, [measure, revision])

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    // Fonts land after first paint and change every width.
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    fonts?.ready?.then(() => measure()).catch(() => undefined)
    return () => ro.disconnect()
  }, [measure])

  return { containerRef, visibleCount, overflow }
}

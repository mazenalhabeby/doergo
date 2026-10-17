"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { usersApi } from "@/lib/api"
import { TOURS } from "./registry"
import { createLocalTourStorage } from "./tour-storage"
import {
  beginSettle,
  boxesAgree,
  isDrawableBox,
  settleTick,
  MEASURE_INTERVAL_MS,
  type Box,
  type Viewport,
} from "./measure"
import type { TourDef, TourGateContext, TourStep } from "./types"
import { useTourProviderData, routeMatches, storage } from "./use-tour-provider-data"
export { routeMatches, storage } from "./use-tour-provider-data"

export interface TourContextValue {
  /** Start a tour by id (used by the Help launcher and programmatic triggers). */
  start: (id: string) => void
  /** Stop the active tour without marking it done. */
  stop: () => void
  /** Tours the current user is eligible for (gated) — for the Help menu. */
  availableTours: TourDef[]
  /** The tour that walks the CURRENT route, if any ("Show me around this page"). */
  contextualTourId: string | null
  activeTourId: string | null
  /** Whether a given tour has been completed (per-browser). Not reactive on its
   *  own — re-read when `activeTourId` changes (start/finish trigger a re-render). */
  isTourCompleted: (id: string) => boolean
}

/**
 * A step's `enter` clicks something that usually ANIMATES (a panel opening, a
 * view switching). This is not a settle time — the stability loop does that —
 * it is only long enough that the animation has STARTED, so the loop cannot
 * mistake the two pre-animation frames for the final position. It replaces the
 * 820ms guess that used to stand in for the whole wait.
 */
export const ENTER_ANIMATION_START_MS = 120

/**
 * How long to keep looking for a target that isn't in the DOM yet, before
 * skipping the step. Unchanged in wall-clock terms from the counts this
 * replaces (22/45 tries at 100ms) — an `optional` step gives up sooner because
 * its target legitimately may not exist at all.
 */
export const ABSENT_BUDGET_MS = { optional: 2200, required: 4500 }

/**
 * Once a position is settled we stop polling and listen for real change
 * (scroll, resize, ResizeObserver). This slow backstop catches the rest — an
 * ancestor animating, a font swapping, a sticky header collapsing — without a
 * 250ms timer re-rendering the whole tour for its entire life. It only calls
 * setState when the rectangle actually moved.
 */
export const IDLE_RECHECK_MS = 1000

/**
 * Scrolling a target into view may need a second go: a panel above it finishes
 * expanding, or a table's rows arrive, and a target scrolled to perfectly a
 * moment ago is pushed back off the screen. Capped, and never twice inside one
 * cooldown — a smooth scroll runs ~300ms and re-issuing one mid-flight fights
 * the animation, which is its own kind of never settling.
 */
export const MAX_SCROLL_ATTEMPTS = 3

export const SCROLL_COOLDOWN_TICKS = 8

/** The element's rectangle, in the plain shape `measure.ts` reasons about. */
export function boxOf(el: HTMLElement): Box {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

export function viewportOf(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight }
}

/** TourProvider's state and handlers — everything before its markup, moved here unchanged. */
export function useTourProvider({ children }: Pick<{ children: React.ReactNode }, 'children'>) {
  const {
    user,
    refreshUser,
    pathname,
    router,
    tourId,
    stepIndex,
    setStepIndex,
    shown,
    setShown,
    activeSteps,
    availableTours,
    tour,
    steps,
    shownEl,
    contextualTourId,
    start,
    finish,
    stop,
    next,
    back,
    onHoleClick,
  } = useTourProviderData({ children })

  // Resolve the current step's target: navigate if needed, wait for the element
  // to exist (dialogs/pages render async), scroll it into view — and then
  // MEASURE UNTIL IT STOPS MOVING rather than measuring once after a guess.
  //
  // The bug this fixes: `scrollIntoView` animates for ~300ms (globals.css sets
  // `scroll-behavior: smooth`, deliberately), while the old code read the rect
  // one animation frame later. The spotlight was placed mid-scroll and a 250ms
  // poll dragged it to the right place afterwards, in full view of the member —
  // who could read, or click the do-it-with-me hot-spot, while it was wrong.
  // Note the bug never reproduced with Lenis driving the page (it forces
  // `scroll-behavior: auto`), which is exactly why it looked intermittent.
  useEffect(() => {
    // Wait for the composition pre-filter to resolve before we start measuring
    // targets, so the very first frame isn't the unfiltered step 0.
    if (!tour || activeSteps === null) return
    const step = steps[stepIndex]
    if (!step) return

    if (step.route && !routeMatches(pathname, step.route)) {
      router.push(step.route)
      return // re-runs when `pathname` updates
    }

    // Entry action: set the screen up for this step (e.g. switch a view).
    if (step.enter) {
      document.querySelector<HTMLElement>(`[data-tour="${step.enter}"]`)?.click()
    }

    let cancelled = false
    let absentTicks = 0
    let settle = beginSettle()
    let scrollAttempts = 0
    let ticksSinceScroll = SCROLL_COOLDOWN_TICKS // the first attempt is immediate
    let timer: ReturnType<typeof setTimeout>

    const absentLimit = Math.ceil(
      (step.optional ? ABSENT_BUDGET_MS.optional : ABSENT_BUDGET_MS.required) / MEASURE_INTERVAL_MS,
    )

    // Target never appeared (conditionally-rendered content, wrong screen, slow
    // render), or never held still long enough to be worth drawing. Skip to the
    // next step so the tour keeps flowing; only end (without completing) if this
    // was the last step. Keep the last SETTLED step on screen so the overlay
    // stays mounted and glides to the next resolved target.
    const giveUp = () => {
      if (stepIndex < steps.length - 1) setStepIndex((i) => i + 1)
      else finish(false)
    }

    // `scrollend` is the browser saying the smooth scroll it owns has finished.
    // We don't BLOCK on it — it never fires when the target was already in view,
    // which would add a timeout to every step — we use it to throw away any
    // readings taken mid-flight, so the pair that settles is always post-scroll.
    // Everywhere without it (Safari), the stability loop alone does the job.
    const onScrollEnd = () => {
      settle = beginSettle()
    }
    const hasScrollEnd = typeof window !== "undefined" && "onscrollend" in window
    if (hasScrollEnd) document.addEventListener("scrollend", onScrollEnd, true)

    const tick = () => {
      if (cancelled) return
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
      if (!el) {
        if (absentTicks++ > absentLimit) return giveUp()
        timer = setTimeout(tick, MEASURE_INTERVAL_MS)
        return
      }

      // Bring it into view, then wait a full interval before the first reading:
      // by then a smooth scroll has actually begun, so two successive readings
      // cannot both be the pre-scroll position and agree with each other —
      // which is the precise shape of the misplacement being fixed. A later
      // attempt happens only if the target has been pushed off-screen again.
      const box = boxOf(el)
      const needsView = scrollAttempts === 0 || !isDrawableBox(box, viewportOf())
      ticksSinceScroll++
      if (needsView && scrollAttempts < MAX_SCROLL_ATTEMPTS && ticksSinceScroll >= SCROLL_COOLDOWN_TICKS) {
        scrollAttempts++
        ticksSinceScroll = 0
        settle = beginSettle() // every reading taken before the scroll is now worthless
        el.scrollIntoView({ block: "center", inline: "center" })
        timer = setTimeout(tick, MEASURE_INTERVAL_MS)
        return
      }

      const { state, status, box: settled } = settleTick(settle, box, viewportOf())
      settle = state
      if (status === "measuring") {
        timer = setTimeout(tick, MEASURE_INTERVAL_MS)
        return
      }
      if (!settled) return giveUp() // exhausted with nothing drawable — never show an empty ring
      setShown({ index: stepIndex, rect: settled, el })
    }

    // An `enter` click usually starts an animation; give it a frame or two to
    // start (not to finish — the loop decides when it has finished).
    timer = setTimeout(tick, step.enter ? ENTER_ANIMATION_START_MS : 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
      if (hasScrollEnd) document.removeEventListener("scrollend", onScrollEnd, true)
    }
  }, [tour, activeSteps, steps, stepIndex, pathname, router, finish])

  // Once a step has settled, keep the spotlight glued to its element — but by
  // WATCHING for real change instead of re-measuring on a timer for the life of
  // the tour. Scroll + resize catch the page moving, a ResizeObserver catches
  // the element itself changing size, and a slow backstop catches the rest.
  // Every path goes through the same guard: a reading that isn't worth drawing
  // (collapsed, or scrolled entirely out of view) is ignored rather than
  // rendered, and an unchanged reading never touches state, so a still page
  // costs no re-renders at all.
  useEffect(() => {
    if (!tourId || !shownEl) return
    const el = shownEl
    const update = () => {
      const box = boxOf(el)
      if (!isDrawableBox(box, viewportOf())) return
      setShown((prev) => (!prev || prev.el !== el || boxesAgree(prev.rect, box) ? prev : { ...prev, rect: box }))
    }
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null
    ro?.observe(el)
    const iv = window.setInterval(update, IDLE_RECHECK_MS)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
      ro?.disconnect()
      window.clearInterval(iv)
    }
    // Keyed on the settled ELEMENT, not on `shown` itself — depending on the
    // rect would tear down and re-attach three listeners on every scroll frame.
  }, [tourId, shownEl])

  // Auto-run the welcome tour EXACTLY ONCE — the first time a freshly-created
  // account reaches the dashboard. `user.guidesSeen` is a per-account server flag
  // (existing users are backfilled to true), so this never fires for returning
  // users and survives browser/device changes. After it runs we flip the flag.
  // Every other tour is launched only from the "Help & guides" button.
  const autoRunFired = useRef(false)
  useEffect(() => {
    if (tourId || !user) return
    if (user.guidesSeen !== false) return // already seen / not a new account
    if (autoRunFired.current) return // one-shot per session
    if (!routeMatches(pathname, "/dashboard")) return // the post-onboarding landing page
    const welcome = availableTours.find((tr) => tr.autoRunOn === "/dashboard")
    if (!welcome) return
    autoRunFired.current = true
    const to = window.setTimeout(() => {
      start(welcome.id)
      // Persist per-account so it never auto-runs again (any browser/device).
      usersApi.updateMe({ guidesSeen: true }).then(() => refreshUser()).catch(() => {})
    }, 900)
    return () => window.clearTimeout(to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, user?.id, user?.guidesSeen, tourId, start, availableTours])

  // Memoised: every page reads this context, and a fresh object each render
  // re-rendered all of them whenever the tour host did.
  const value = useMemo<TourContextValue>(() => ({
    start,
    stop,
    availableTours,
    contextualTourId,
    activeTourId: tourId,
    isTourCompleted: (id) => storage.isCompleted(id),
  }), [start, stop, availableTours, contextualTourId, tourId])

  return {
    shown,
    activeSteps,
    tour,
    steps,
    stop,
    next,
    back,
    onHoleClick,
    value,
  }
}

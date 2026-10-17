"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { TOURS } from "./registry"
import { createLocalTourStorage } from "./tour-storage"
import { type Box } from "./measure"
import type { TourGateContext, TourStep } from "./types"

export const storage = createLocalTourStorage()

/** Match a route against a tour's `autoRunOn` (exact or path-prefix). */
export function routeMatches(pathname: string, pattern: string) {
  return pathname === pattern || pathname.startsWith(pattern.endsWith("/") ? pattern : pattern + "/")
}

/** useTourProvider's state and handlers — everything before its markup, moved here unchanged. */
export function useTourProviderData({ children }: Pick<Pick<{ children: React.ReactNode }, 'children'>, 'children'>) {
  const { user, hasModule, hasPlanFeature, hasPermission, refreshUser } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const [tourId, setTourId] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  // What is ON SCREEN: a settled rectangle together with the step it belongs to.
  // The two travel as ONE value on purpose. They used to be separate, so the
  // moment `stepIndex` advanced the tooltip showed the NEW step's words over the
  // PREVIOUS step's spotlight until a measurement arrived — and if the new
  // target was slow (or was skipped for never appearing) the member read a
  // description of one thing while a different thing was highlighted. The text
  // and the highlight now change in the same render, always.
  const [shown, setShown] = useState<{ index: number; rect: Box; el: HTMLElement } | null>(null)
  // Composition-aware step list: once a tour starts and we're on its route, we
  // pre-filter its steps to drop any `dynamic` step whose target isn't on screen
  // (so the total + numbering match the actual dashboard composition). `null`
  // means "not resolved yet" — the overlay stays hidden until it's set.
  const [activeSteps, setActiveSteps] = useState<TourStep[] | null>(null)

  const gateCtx: TourGateContext = useMemo(
    () => ({
      role: user?.role ?? "",
      isAdmin: (user?.role ?? "") === "ADMIN",
      hasModule,
      hasPlanFeature,
      hasPermission,
    }),
    [user?.role, hasModule, hasPlanFeature, hasPermission],
  )

  const availableTours = useMemo(() => TOURS.filter((tr) => !tr.gate || tr.gate(gateCtx)), [gateCtx])
  const tour = useMemo(() => (tourId ? TOURS.find((t) => t.id === tourId) ?? null : null), [tourId])

  // The step list the engine actually runs: the composition-filtered list once it
  // has resolved, else the tour's full list (used as a safe fallback everywhere).
  const steps = useMemo(() => activeSteps ?? tour?.steps ?? [], [activeSteps, tour])

  // The element the settled rectangle was measured from — the watcher's key.
  const shownEl = shown?.el ?? null

  // The tour (if any) that walks the current route — drives "Show me this page".
  const contextualTourId = useMemo(() => {
    const match = availableTours.find(
      (tr) =>
        tr.autoRunOn &&
        (tr.autoRunExact ? pathname === tr.autoRunOn : routeMatches(pathname, tr.autoRunOn)),
    )
    return match?.id ?? null
  }, [availableTours, pathname])

  const start = useCallback(
    (id: string) => {
      // A tour launched from the Help menu / user dropdown may live on another
      // route (e.g. the Tasks tour while you're on Schedule). Navigate to the
      // tour's page first so its steps resolve — the resolution effect re-runs
      // once `pathname` updates and finds the targets on the new screen.
      const tr = TOURS.find((t) => t.id === id)
      if (tr?.autoRunOn) {
        const onRoute = tr.autoRunExact
          ? pathname === tr.autoRunOn
          : routeMatches(pathname, tr.autoRunOn)
        if (!onRoute) router.push(tr.autoRunOn)
      }
      setShown(null)
      setStepIndex(0)
      setActiveSteps(null) // re-resolved by the composition effect once on-route
      setTourId(id)
    },
    [pathname, router],
  )

  const finish = useCallback(
    (complete: boolean) => {
      if (complete && tourId) storage.markCompleted(tourId)
      setShown(null)
      setActiveSteps(null)
      setTourId(null)
    },
    [tourId],
  )
  // Dismissing (the X or Skip) marks the tour as seen so the auto-run doesn't
  // immediately re-open it on the same page. It stays replayable from the Help menu.
  const stop = useCallback(() => {
    if (tourId) storage.markCompleted(tourId)
    finish(false)
  }, [tourId, finish])

  // Note: we intentionally DON'T clear `shown` on step change. Keeping the last
  // settled step on screen keeps the overlay mounted so the spotlight + tooltip
  // GLIDE to the next target (CSS transitions) instead of unmounting and
  // re-popping every step — and, because the rect carries its own step, what the
  // member reads during those ~130ms still describes what is highlighted.
  //
  // Both buttons move relative to the step ON SCREEN, not to the engine's
  // cursor. The two differ while a step is resolving — and by seconds if the
  // engine is skipping targets that never appear — so reading the cursor made
  // Next jump past a step the member never saw, and Back walk forward.
  const next = useCallback(() => {
    if (!tour) return
    const from = shown?.index ?? stepIndex
    if (from >= steps.length - 1) {
      finish(true)
      return
    }
    setStepIndex(from + 1)
  }, [tour, steps, stepIndex, shown, finish])

  const back = useCallback(() => {
    setStepIndex(Math.max(0, (shown?.index ?? stepIndex) - 1))
  }, [shown, stepIndex])

  // Do-it-with-me: perform the real element's action, then advance. It clicks
  // the element the member is LOOKING at (`shown`), never the one the engine
  // happens to be resolving — otherwise a click during the ~130ms handover
  // would fire on the next step's element.
  const onHoleClick = useCallback(() => {
    shown?.el.click()
    next()
  }, [shown, next])

  // Composition pre-filter: once a tour is active AND we're on its route, build
  // the actual step list for THIS screen — keep every non-`dynamic` step (their
  // targets may still appear later via enter/route/dialogs, handled reactively),
  // and drop a `dynamic` step only if its target isn't present after a few
  // retries. This gives a correct total + numbering that matches the rendered
  // dashboard composition (spaces / tasks / management / activity vary per user).
  useEffect(() => {
    if (!tour) return
    // If the tour lives on a specific route, wait until we're there so the
    // dynamic targets have a chance to render before we measure presence.
    if (tour.autoRunOn) {
      const onRoute = tour.autoRunExact
        ? pathname === tour.autoRunOn
        : routeMatches(pathname, tour.autoRunOn)
      if (!onRoute) return // re-runs when pathname updates
    }

    let cancelled = false
    let tries = 0
    let timer: ReturnType<typeof setTimeout>

    const resolve = () => {
      if (cancelled) return
      const present = (target: string) =>
        !!document.querySelector(`[data-tour="${target}"]`)
      // Are all dynamic targets accounted for yet (present, or we've exhausted
      // retries and treat the rest as absent)? Retry a few times so a slightly
      // late render isn't misread as "missing".
      const anyDynamicMissing = tour.steps.some(
        (s) => s.dynamic === true && !present(s.target),
      )
      if (anyDynamicMissing && tries++ < 4) {
        timer = setTimeout(resolve, 120)
        return
      }
      const filtered = tour.steps.filter(
        (s) => s.dynamic !== true || present(s.target),
      )
      setActiveSteps(filtered.length > 0 ? filtered : tour.steps)
      setStepIndex(0)
    }

    // Short render delay so the dashboard's conditional branches have mounted.
    timer = setTimeout(resolve, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // Keyed on tourId (via `tour`) + pathname per spec; re-resolves if the tour
    // or route changes. stepIndex is intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour, pathname])

  return {
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
  }
}

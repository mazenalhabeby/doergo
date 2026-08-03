"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { useAuth } from "@/contexts/auth-context"
import { usersApi } from "@/lib/api"
import { TOURS } from "./registry"
import { createLocalTourStorage } from "./tour-storage"
import { TourOverlay } from "./tour-overlay"
import type { TourDef, TourGateContext, TourStep } from "./types"

interface TourContextValue {
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

const Ctx = createContext<TourContextValue | null>(null)
const storage = createLocalTourStorage()

/** Match a route against a tour's `autoRunOn` (exact or path-prefix). */
function routeMatches(pathname: string, pattern: string) {
  return pathname === pattern || pathname.startsWith(pattern.endsWith("/") ? pattern : pattern + "/")
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { user, hasModule, hasPlanFeature, hasPermission, refreshUser } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const [tourId, setTourId] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  // Composition-aware step list: once a tour starts and we're on its route, we
  // pre-filter its steps to drop any `dynamic` step whose target isn't on screen
  // (so the total + numbering match the actual dashboard composition). `null`
  // means "not resolved yet" — the overlay stays hidden until it's set.
  const [activeSteps, setActiveSteps] = useState<TourStep[] | null>(null)
  const elRef = useRef<HTMLElement | null>(null)

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
      elRef.current = null
      setRect(null)
      setStepIndex(0)
      setActiveSteps(null) // re-resolved by the composition effect once on-route
      setTourId(id)
    },
    [pathname, router],
  )

  const finish = useCallback(
    (complete: boolean) => {
      if (complete && tourId) storage.markCompleted(tourId)
      elRef.current = null
      setRect(null)
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

  // Note: we intentionally DON'T clear `rect` on step change. Keeping the last
  // rect keeps the overlay mounted so the spotlight + tooltip GLIDE to the next
  // target (CSS transitions) instead of unmounting and re-popping every step.
  const next = useCallback(() => {
    if (!tour) return
    if (stepIndex >= steps.length - 1) {
      finish(true)
      return
    }
    elRef.current = null
    setStepIndex((i) => i + 1)
  }, [tour, steps, stepIndex, finish])

  const back = useCallback(() => {
    elRef.current = null
    setStepIndex((i) => Math.max(0, i - 1))
  }, [])

  // Do-it-with-me: perform the real element's action, then advance.
  const onHoleClick = useCallback(() => {
    elRef.current?.click()
    next()
  }, [next])

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

  // Resolve the current step's target: navigate if needed, then wait for the
  // element to exist (dialogs/pages render async), scroll it into view, measure.
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
    let tries = 0
    let timer: ReturnType<typeof setTimeout>
    const find = () => {
      if (cancelled) return
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
      if (el) {
        elRef.current = el
        el.scrollIntoView({ block: "center", inline: "center" })
        requestAnimationFrame(() => {
          if (!cancelled) setRect(el.getBoundingClientRect())
        })
        return
      }
      if (tries++ > (step.optional ? 22 : 45)) {
        // Target never appeared (conditionally-rendered content, wrong screen,
        // slow render). Skip to the next step so the tour keeps flowing; only
        // end (without completing) if this was the last step. Keep the last rect
        // so the overlay stays mounted and glides to the next resolved target.
        if (stepIndex < steps.length - 1) {
          setStepIndex((i) => i + 1)
        } else {
          finish(false)
        }
        return
      }
      timer = setTimeout(find, 100)
    }
    // An `enter` step usually triggers an animation (opening a panel, expanding a
    // card). Give it time to settle before measuring so the spotlight lands on
    // the final position, not a mid-transition frame.
    timer = setTimeout(find, step.enter ? 820 : 60)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [tour, activeSteps, steps, stepIndex, pathname, router, finish])

  // Keep the spotlight glued to the element as the page scrolls / resizes.
  useEffect(() => {
    if (!tourId) return
    const update = () => {
      if (elRef.current) setRect(elRef.current.getBoundingClientRect())
    }
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    const iv = window.setInterval(update, 250)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
      window.clearInterval(iv)
    }
  }, [tourId, stepIndex])

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

  const value: TourContextValue = {
    start,
    stop,
    availableTours,
    contextualTourId,
    activeTourId: tourId,
    isTourCompleted: (id) => storage.isCompleted(id),
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      {tour && activeSteps && rect && steps[stepIndex] && (
        <TourOverlay
          rect={rect}
          step={steps[stepIndex]!}
          index={stepIndex}
          total={steps.length}
          onNext={next}
          onBack={back}
          onSkip={stop}
          onHoleClick={onHoleClick}
        />
      )}
    </Ctx.Provider>
  )
}

export function useTour() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useTour must be used within <TourProvider>")
  return ctx
}

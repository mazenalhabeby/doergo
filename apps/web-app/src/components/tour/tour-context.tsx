"use client"

import { useContext, useEffect, useMemo, useRef } from "react"

import { usersApi } from "@/lib/api"
import { TourOverlay } from "./tour-overlay"
import { Ctx, type TourContextValue } from "./tour-context-value"
import { routeMatches, storage, useTourState } from "./use-tour-state"
import { useTourSpotlight } from "./use-tour-spotlight"

export function TourProvider({ children }: { children: React.ReactNode }) {
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
  } = useTourState()

  useTourSpotlight({
    tour,
    tourId,
    activeSteps,
    steps,
    stepIndex,
    setStepIndex,
    setShown,
    shownEl,
    pathname,
    router,
    finish,
  })

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
      usersApi
        .updateMe({ guidesSeen: true })
        .then(() => refreshUser())
        .catch(() => {})
    }, 900)
    return () => window.clearTimeout(to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, user?.id, user?.guidesSeen, tourId, start, availableTours])

  // Memoised: every page reads this context, and a fresh object each render
  // re-rendered all of them whenever the tour host did.
  const value = useMemo<TourContextValue>(
    () => ({
      start,
      stop,
      availableTours,
      contextualTourId,
      activeTourId: tourId,
      isTourCompleted: (id) => storage.isCompleted(id),
    }),
    [start, stop, availableTours, contextualTourId, tourId],
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Rendered from `shown`, never from `stepIndex`: the words and the
          highlight are one value, so they can never describe different things. */}
      {tour && activeSteps && shown && steps[shown.index] && (
        <TourOverlay
          rect={shown.rect}
          step={steps[shown.index]!}
          index={shown.index}
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

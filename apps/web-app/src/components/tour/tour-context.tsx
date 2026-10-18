"use client"

import { useContext } from "react"

import { TourOverlay } from "./tour-overlay"
import { useTourProvider } from "./use-tour-provider"
import { Ctx } from "./tour-provider-helpers"

export function TourProvider({ children }: { children: React.ReactNode }) {
  const {
    shown,
    activeSteps,
    tour,
    steps,
    stop,
    next,
    back,
    onHoleClick,
    value,
  } = useTourProvider({ children })

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

"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { useAuth } from "@/contexts/auth-context"
import { usersApi } from "@/lib/api"
import { TOURS } from "./registry"
import { createLocalTourStorage } from "./tour-storage"
import { TourOverlay } from "./tour-overlay"
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
import { useTourProvider, type TourContextValue } from "./use-tour-provider"
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

"use client"

import { createContext } from "react"
import type { TourDef } from "./types"

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

/** The tour context; read through `useTour()`. */
export const Ctx = createContext<TourContextValue | null>(null)

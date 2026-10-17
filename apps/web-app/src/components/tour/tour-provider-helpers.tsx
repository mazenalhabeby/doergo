"use client"

import { createContext } from "react"
import { type TourContextValue } from "./use-tour-provider"

/** TourProvider's module-level helpers, moved here unchanged so its sections can read them too. */
export const Ctx = createContext<TourContextValue | null>(null)

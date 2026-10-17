"use client"

import { lazy } from "react"

/** EditTaskDialog's module-level helpers, moved here unchanged so its sections can read them too. */
export const LocationPicker = lazy(() =>
  import("@/components/location-picker").then((m) => ({ default: m.LocationPicker }))
)

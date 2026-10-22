"use client"

import dynamic from "next/dynamic"

/** AssetRecordDialog's module-level helpers, moved here unchanged so its sections can read them too. */
export const LocationPicker = dynamic(
  () => import("@/components/map/location-picker"),
  { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-muted" /> },
)

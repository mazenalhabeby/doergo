"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

/** SpaceForm's module-level helpers, moved here unchanged so its sections can read them too. */
export const LocationPicker = dynamic(() => import("@/components/location-picker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/40">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
})

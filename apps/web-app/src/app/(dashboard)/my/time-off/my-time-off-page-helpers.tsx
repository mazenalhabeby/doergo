"use client"

import { cn } from "@/lib/utils"
import { formatMediumDate } from "@/lib/format-date"
import type { Tone } from "@/lib/status-tones"

/** MyTimeOffPage's module-level helpers, moved here unchanged so its sections can read them too. */
/** A request's state as one of the six tones (lib/status-tones). */
export const STATUS_TONE: Record<string, Tone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELED: "neutral",
}

export function fmt(iso?: string): string {
  if (!iso) return "—"
  // A bare day key is read at LOCAL midnight — `new Date("2026-10-05")` is UTC
  // midnight, which west of Greenwich is still the 4th.
  return formatMediumDate(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso)
}

export function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
    </span>
  )
}

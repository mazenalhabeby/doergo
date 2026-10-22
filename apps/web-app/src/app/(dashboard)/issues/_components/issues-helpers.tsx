"use client"

import { cn } from "@/lib/utils"
import { dateLocale } from "@/lib/format-date"
import { getPriorityConfig } from "@/lib/constants"
import { toneChip, type Tone } from "@/lib/status-tones"
import { TaskPriority } from "@hbcfield/shared/types"
import { PRIORITY_COLORS } from "@hbcfield/shared/constants"

/** Shared by the issues page and its thread; moved here unchanged. */
/** An issue's severity reads the task priority colours (one source for LOW…URGENT). */
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const
export const SEV_DOT: Record<string, string> = Object.fromEntries(
  SEVERITIES.map((p) => [p, getPriorityConfig(p).dotColor]),
)
export const SEV_TEXT: Record<string, string> = Object.fromEntries(
  SEVERITIES.map((p) => [p, PRIORITY_COLORS[p as TaskPriority].text]),
)

/** An issue's state as one of the six tones (lib/status-tones). */
const STATUS_TONE: Record<string, Tone> = {
  OPEN: "danger",
  ACKNOWLEDGED: "warning",
  IN_PROGRESS: "primary",
  RESOLVED: "success",
  CLOSED: "neutral",
  CANCELED: "neutral",
}
const STATUS: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_TONE).map(([status, tone]) => [status, cn("border-transparent", toneChip(tone))]),
)

export const RESOLVE_REASONS = [
  "Fixed on site",
  "Parts not available",
  "Needs a specialist",
  "Customer unavailable",
  "Duplicate",
  "Not an issue",
]

export const fmt = (iso: string) =>
  new Date(iso).toLocaleString(dateLocale(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })

export const isImg = (m?: string) => !!m && m.startsWith("image/")

export const Chip = ({ status }: { status: string }) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] " + "font-semibold uppercase tracking-wide",
      STATUS[status],
    )}
  >
    {status.replace("_", " ")}
  </span>
)

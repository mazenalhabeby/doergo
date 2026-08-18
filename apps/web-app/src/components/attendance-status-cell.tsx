"use client"

import { useTranslation } from "react-i18next"

import { type TimeEntry } from "@/lib/api"
import {
  deriveAttendanceFlags,
  deriveAttendanceState,
  type AttendanceChip,
  type AttendanceTone,
} from "@/lib/attendance-status"
import { cn } from "@/lib/utils"

/**
 * Status cell for attendance tables: one state chip (Active / Needs review /
 * Approved / Rejected / OK) plus the flags that explain it (Late, Unscheduled,
 * geofence, overtime…). See `lib/attendance-status.ts` for why this replaced the
 * old In Zone / Out of Zone badge.
 */

const TONE_CLASSES: Record<AttendanceTone, string> = {
  green: "border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400",
  amber: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  red: "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
  blue: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  orange: "border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  purple: "border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400",
  muted: "border-border bg-muted text-muted-foreground",
}

const TONE_DOT: Record<AttendanceTone, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  orange: "bg-orange-500",
  purple: "bg-purple-500",
  muted: "bg-muted-foreground",
}

export function AttendanceStatusCell({
  entry,
  maxFlags = 2,
}: {
  entry: TimeEntry
  /** Flags beyond this collapse into a "+N" chip whose tooltip lists them all. */
  maxFlags?: number
}) {
  const { t } = useTranslation()
  const label = (chip: AttendanceChip) => t(chip.labelKey, chip.fallback)

  const state = deriveAttendanceState(entry)
  const flags = deriveAttendanceFlags(entry)
  const shown = flags.slice(0, maxFlags)
  const hidden = flags.slice(maxFlags)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
          TONE_CLASSES[state.tone],
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[state.tone])} />
        {label(state)}
      </span>

      {shown.map((chip) => (
        <span
          key={chip.key}
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
            TONE_CLASSES[chip.tone],
          )}
        >
          {label(chip)}
        </span>
      ))}

      {hidden.length > 0 && (
        <span
          title={hidden.map(label).join(" · ")}
          className="inline-flex cursor-help items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          +{hidden.length}
        </span>
      )}
    </div>
  )
}

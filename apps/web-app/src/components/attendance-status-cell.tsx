"use client"

import { type TimeEntry } from "@/lib/api"
import { deriveAttendanceFlags, deriveAttendanceState } from "@/lib/attendance-status"
import { LabelChip, LABEL_TONE_CLASSES, LABEL_TONE_DOT } from "@/components/attendance-label-chip"
import { useTimeFormat } from "@/hooks/use-time-format"
import { cn } from "@/lib/utils"

/**
 * Status cell for attendance tables: one state chip (Active / Needs review /
 * Approved / Rejected / Auto-approved) plus the labels that explain it (Late,
 * Unscheduled, outside the zone, overtime…), with each label's reason on hover.
 * See `lib/attendance-status.ts` for why this replaced the old In Zone badge.
 */

export function AttendanceStatusCell({
  entry,
  maxFlags = 2,
}: {
  entry: TimeEntry
  /** Flags beyond this collapse into a "+N" chip whose tooltip lists them all. */
  maxFlags?: number
}) {
  const reader = useTimeFormat()
  const state = deriveAttendanceState(entry, reader)
  const flags = deriveAttendanceFlags(entry, reader)
  const shown = flags.slice(0, maxFlags)
  const hidden = flags.slice(maxFlags)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
          LABEL_TONE_CLASSES[state.tone],
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", LABEL_TONE_DOT[state.tone])} />
        {state.label}
      </span>

      {shown.map((chip) => (
        <LabelChip key={chip.key} chip={chip} />
      ))}

      {hidden.length > 0 && (
        <span
          title={hidden.map((c) => c.label).join(" · ")}
          className={
            "inline-flex cursor-help items-center rounded-full border border-border " +
            "bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          }
        >
          +{hidden.length}
        </span>
      )}
    </div>
  )
}

"use client"

import { type AttendanceChip, type AttendanceTone } from "@/lib/attendance-status"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ACCENT_SOFT, CRIT_SOFT, WARN_SOFT } from "./time-styles"

/**
 * One attendance label as a chip — the same colours on every attendance
 * screen (Attendance Management, the member page, the worker's own page), with
 * the label's reason on hover when the entry saved one (`labelFacts`).
 */

export const LABEL_TONE_CLASSES: Record<AttendanceTone, string> = {
  green: ACCENT_SOFT,
  amber: WARN_SOFT,
  red: CRIT_SOFT,
  // Kinds of time (away, extra, a rest) keep their own hue, drawn as the same soft chip.
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  orange: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  purple: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  muted: "bg-shell-chip text-muted-foreground",
}

export const LABEL_TONE_DOT: Record<AttendanceTone, string> = {
  green: "bg-shell-accent",
  amber: "bg-shell-warn",
  red: "bg-shell-crit",
  blue: "bg-blue-500",
  orange: "bg-orange-500",
  purple: "bg-purple-500",
  muted: "bg-muted-foreground",
}

const CHIP = "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold"

export function LabelChip({ chip, className }: { chip: AttendanceChip; className?: string }) {
  const body = <span className={cn(CHIP, LABEL_TONE_CLASSES[chip.tone], className)}>{chip.label}</span>
  if (!chip.explanation) return body
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className="cursor-help rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {body}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{chip.explanation}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

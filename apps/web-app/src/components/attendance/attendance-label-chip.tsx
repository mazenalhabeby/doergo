"use client"

import { type AttendanceChip, type AttendanceTone } from "@/lib/attendance-status"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * One attendance label as a chip — the same colours on every attendance
 * screen (Attendance Management, the member page, the worker's own page), with
 * the label's reason on hover when the entry saved one (`labelFacts`).
 */

export const LABEL_TONE_CLASSES: Record<AttendanceTone, string> = {
  green: "border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400",
  amber: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  red: "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
  blue: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  orange: "border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  purple: "border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400",
  muted: "border-border bg-muted text-muted-foreground",
}

export const LABEL_TONE_DOT: Record<AttendanceTone, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  orange: "bg-orange-500",
  purple: "bg-purple-500",
  muted: "bg-muted-foreground",
}

const CHIP = "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"

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

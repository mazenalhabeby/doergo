"use client"

import { useTranslation } from "react-i18next"
import { PauseCircle } from "lucide-react"
import { isJobPaused } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"

/**
 * "Paused · no handover" — a job its worker clocked out of (shared
 * tasks/handover.ts), flagged for the office wherever the job is listed. ONE
 * chip for the board and the list. Nothing for a job that is not paused.
 */
export function PausedChip({ task, className }: { task: { pausedAt?: string | null; handoverDueById?: string | null }; className?: string }) {
  const { t } = useTranslation()
  if (!isJobPaused(task)) return null
  const owed = !!task.handoverDueById
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        owed
          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
          : "bg-muted text-muted-foreground",
        className,
      )}
      title={owed ? t("tasks.handover.chipOwedTitle") : t("tasks.handover.chipTitle")}
    >
      <PauseCircle className="size-3" />
      {owed ? t("tasks.handover.chipOwed") : t("tasks.handover.chip")}
    </span>
  )
}

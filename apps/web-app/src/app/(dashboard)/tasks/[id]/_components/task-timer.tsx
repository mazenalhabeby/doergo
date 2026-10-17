"use client"

import type { Task } from "@/lib/api"
import { formatDuration } from "@hbcfield/shared/client"
import { useJobTime } from "@/hooks/use-job-time"
import type { User as AuthUser } from "@/contexts/auth-context"
import { useTranslation } from "react-i18next"
import { Clock } from "lucide-react"
import type { WorkflowStatus } from "@/lib/api"

export interface TaskDetailHeaderProps {
  task: Task
  user: AuthUser | null
  canEdit: boolean
  canAssign: boolean
  isCompleted: boolean
  isCanceled: boolean
  hasAssignee: boolean
  hasModule: (m: string) => boolean
  allowedTransitions: WorkflowStatus[]
  onTitleSave: (value: string) => Promise<void> | void
  onStatusChange: (status: string) => void
  onAssignClick: () => void
  onEditClick: () => void
  onCancelTask: () => void
  /** Cancelling is destructive and permission-gated in its own right. */
  canCancel: boolean
  isStatusChanging: boolean
}

// ---------------------------------------------------------------------------
// TaskTimer — the job's WORKING time (shared tasks/job-time.ts), the same
// figure as the job-time card below it. It used to count from Accepted to
// Completed — the evening before, every night and the weekend — and read
// "13d 17h" above a card saying 68h of work.
// ---------------------------------------------------------------------------
export function TaskTimer({ taskId, paused }: { taskId: string; paused: boolean }) {
  const { t } = useTranslation()
  const { time, live } = useJobTime(taskId, paused)
  if (!time || time.working + time.travel === 0) return null
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tabular-nums bg-muted text-foreground"
      title={t("tasks.jobTime.title")}
    >
      <Clock className="size-3" />
      {formatDuration(time.working)}
      {live ? <span className="size-1.5 rounded-full bg-green-500" /> : null}
    </span>
  )
}

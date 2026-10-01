"use client"

import type { Task } from "@/lib/api"
import { formatDuration } from "@hbcfield/shared/client"
import { useJobTime } from "@/hooks/use-job-time"
import type { User as AuthUser } from "@/contexts/auth-context"
import { useTranslation } from "react-i18next"
import Link from "next/link"
import {
  Calendar,
  Pencil,
  MoreHorizontal,
  Trash2,
  MapPin,
  ChevronRight,
  Clock,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getStatusConfig } from "@/lib/constants"
import { getRequestId } from "@/lib/utils"
import { formatMediumDate as formatShortDate } from "@/lib/format-date"
import { InlineEditField } from "./inline-edit-field"
import type { WorkflowStatus } from "@/lib/api"

interface TaskDetailHeaderProps {
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

export function TaskDetailHeader({
  task,
  user,
  canEdit,
  canAssign,
  isCompleted,
  isCanceled,
  hasAssignee,
  hasModule,
  allowedTransitions,
  onTitleSave,
  onStatusChange,
  onAssignClick,
  onEditClick,
  onCancelTask,
  canCancel,
  isStatusChanging,
}: TaskDetailHeaderProps) {
  const { t } = useTranslation()
  const requestId = getRequestId(task, user?.organizationName)
  const taskDate = formatShortDate(task.createdAt)
  const statusConfig = getStatusConfig(task.status)

  return (
    <div className="mb-6">
      {/* Breadcrumb-style context line */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <span>{t("tasks.page.heading")}</span>
        <ChevronRight className="size-3" />
        <span className="text-foreground font-medium">{requestId}</span>
        <span className="mx-1">·</span>
        <Calendar className="size-3" />
        <span>{taskDate}</span>
      </div>

      {/* Title row */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <InlineEditField
            value={task.title}
            onSave={onTitleSave}
            type="text"
            disabled={!canEdit}
            className="text-2xl font-semibold"
          />
        </div>

        {/* Actions — clean, minimal */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/*
            Edit is a button, not a menu item.

            It lived inside the unlabelled ⋯ menu, which is where you put things
            people occasionally need — not the primary action of the page. "There
            is no way to edit the task" is what that looks like from the outside.
            Cancel stays in the menu: it is destructive and belongs one step away.
          */}
          {!isCompleted && !isCanceled && canEdit && (
            <Button variant="outline" size="sm" className="h-8" onClick={onEditClick}>
              <Pencil className="size-3.5 mr-1.5" />
              {t("tasks.detail.editTask")}
            </Button>
          )}
          {/* Only render actions the viewer may actually perform — the menu used
              to appear for anyone on an unfinished task, so Edit 403'd on save
              and Cancel sat one click away for people without the permission. */}
          {!isCompleted && !isCanceled && canCancel && (
            <AlertDialog>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {canCancel && (
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer">
                        <Trash2 className="size-4 mr-2" />
                        {t("tasks.detail.cancelRequest")}
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("tasks.detail.cancelRequestTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("tasks.detail.cancelRequestDescription")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("tasks.detail.keepRequest")}</AlertDialogCancel>
                  <AlertDialogAction onClick={onCancelTask} className="bg-red-600 hover:bg-red-700">
                    {t("tasks.detail.cancelRequestConfirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Status + metadata + transitions — all in one clean row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Status badge */}
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{
            backgroundColor: `${statusConfig.hex}14`,
            color: statusConfig.hex,
          }}
        >
          <span className="size-1.5 rounded-full animate-pulse" style={{ backgroundColor: statusConfig.hex }} />
          {statusConfig.label}
        </span>

        {/* Time on task — DB-anchored, live; same value on web, mobile & for admins */}
        <TaskTimer taskId={task.id} paused={!!task.pausedAt} />

        {/*
          Transitions as pills — offered exactly when one exists.

          This was gated on hasWorkflow, so a task on the canonical state
          machine (most of them) showed a status badge and no way to change it,
          while the board and the list both offered one. It was also hidden on
          any finished task, which left COMPLETED with no route to CLOSED now
          that finished cards cannot be dragged either — a status the flow
          declares but nothing could reach.

          The transition table decides on its own now, and it is the same table
          the server enforces: CANCELED and CLOSED offer nothing because they
          have nothing, and COMPLETED offers the one step it has. Closing a
          finished task is not editing it.
        */}
        {allowedTransitions.length > 0 && (
          <>
            <ChevronRight className="size-3 text-muted-foreground/40" />
            {allowedTransitions.map((s) => (
              <button
                key={s.id}
                onClick={() => onStatusChange(s.key)}
                disabled={isStatusChanging}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-150 hover:shadow-sm disabled:opacity-50"
                style={{
                  borderColor: `${s.color}30`,
                  color: s.color,
                  backgroundColor: "transparent",
                }}
                onMouseEnter={(e) => { (e.currentTarget.style.backgroundColor = `${s.color}10`) }}
                onMouseLeave={(e) => { (e.currentTarget.style.backgroundColor = "transparent") }}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
              </button>
            ))}
          </>
        )}

        {/* Divider */}
        <span className="w-px h-4 bg-border/60 mx-1" />

        {/* Space */}
        {task.space && (
          <Link href={`/tasks?space=${task.space.id}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors">
            <MapPin className="size-2.5" />
            {task.space.name}
          </Link>
        )}

        {/* Phase */}
        {hasModule("phases") && task.phase && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
            style={{ backgroundColor: `${task.phase.color}14`, color: task.phase.color }}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: task.phase.color }} />
            {task.phase.name}
          </span>
        )}

        {/* Sprint */}
        {hasModule("sprints") && task.sprint && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-green-500/10 text-green-700 dark:text-green-400">
            {task.sprint.name}
          </span>
        )}

        {/* Story Points */}
        {hasModule("story_points") && task.storyPoints != null && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-bold tabular-nums bg-muted text-muted-foreground">
            {t("tasks.units.points", { count: task.storyPoints })}
          </span>
        )}

        {/* Epic */}
        {hasModule("epics") && task.epic && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
            style={{ backgroundColor: `${task.epic.color}14`, color: task.epic.color }}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: task.epic.color }} />
            {task.epic.name}
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TaskTimer — the job's WORKING time (shared tasks/job-time.ts), the same
// figure as the job-time card below it. It used to count from Accepted to
// Completed — the evening before, every night and the weekend — and read
// "13d 17h" above a card saying 68h of work.
// ---------------------------------------------------------------------------
function TaskTimer({ taskId, paused }: { taskId: string; paused: boolean }) {
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

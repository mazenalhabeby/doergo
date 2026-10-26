"use client"

import { useTranslation } from "react-i18next"
import Link from "next/link"
import { Calendar, Pencil, MoreHorizontal, Trash2, MapPin, ChevronRight, FileText } from "lucide-react"
import { GradientIcon } from "@/components/ui/gradient-icon"
import { useRouteAccess } from "@/hooks/use-route-access"

import { Button } from "@/components/ui/button"
import { AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useStepConfigs } from "@/hooks/use-step-config"
import { getRequestId } from "@/lib/utils"
import { formatMediumDate as formatShortDate } from "@/lib/format-date"
import { InlineEditField } from "./inline-edit-field"
import { type TaskDetailHeaderProps, TaskTimer } from "./task-timer"

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
  const { may } = useRouteAccess()
  const mayMessage = may("/messages")
  const requestId = getRequestId(task, user?.organizationName)
  const taskDate = formatShortDate(task.createdAt)
  // The step's own name from the task's flow — the fixed table is English and knows only built-in steps.
  const statusConfig = useStepConfigs([task])(task)

  return (
    <div className="mb-5">
      {/* Breadcrumb-style context line */}
      <div className="mb-2 flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <span>{t("tasks.page.heading")}</span>
        <ChevronRight className="size-3" />
        <span className="text-foreground font-medium">{requestId}</span>
        <span className="mx-1">·</span>
        <Calendar className="size-3" />
        <span>{taskDate}</span>
      </div>

      {/* Title row */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3.5">
        <div className="flex-1 min-w-0">
          <InlineEditField
            value={task.title}
            onSave={onTitleSave}
            type="text"
            disabled={!canEdit}
            className="text-[30px] font-semibold leading-[1.15] tracking-[-0.03em]"
          />
        </div>

        {/* Actions — clean, minimal */}
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {/*
            Edit is a button, not a menu item.

            It lived inside the unlabelled ⋯ menu, which is where you put things
            people occasionally need — not the primary action of the page. "There
            is no way to edit the task" is what that looks like from the outside.
            Cancel stays in the menu: it is destructive and belongs one step away.
          */}
          {/*
            The job report — offered once the job is DONE: its flow's final step
            (not a canceled one), so a custom workflow's own "Delivered" counts.
            The server applies the job's own read gate either way.
          */}
          {/*
            The job's chat: its crew, and the office through this same job gate
            (POST /chat/tasks/:id, 404 otherwise). Opened — and created — on first
            tap, never for every job. A finished job's chat still opens, to read.
          */}
          {mayMessage && (
            <Button variant="outline" size="pill" className="icon-motion" asChild>
              <Link href={`/messages?task=${encodeURIComponent(task.id)}`}>
                <GradientIcon name="chat" size={17} />
                {t("chat.jobChat", "Chat")}
              </Link>
            </Button>
          )}
          {isCompleted && !isCanceled && (
            <Button variant="outline" size="pill" asChild>
              <Link href={`/tasks/${task.id}/report`}>
                <FileText />
                {t("tasks.report.open")}
              </Link>
            </Button>
          )}
          {!isCompleted && !isCanceled && canEdit && (
            <Button variant="outline" size="pill" onClick={onEditClick}>
              <Pencil />
              {t("tasks.detail.editTask")}
            </Button>
          )}
          {/* Only render actions the viewer may actually perform — the menu used
              to appear for anyone on an unfinished task, so Edit 403'd on save
              and Cancel sat one click away for people without the permission. */}
          {!isCompleted && !isCanceled && canCancel && (
            <ConfirmDialog
              trigger={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="pillIcon">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {canCancel && (
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive">
                          <Trash2 className="size-4 mr-2" />
                          {t("tasks.detail.cancelRequest")}
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              }
              title={t("tasks.detail.cancelRequestTitle")}
              description={t("tasks.detail.cancelRequestDescription")}
              cancelLabel={t("tasks.detail.keepRequest")}
              confirmLabel={t("tasks.detail.cancelRequestConfirm")}
              onConfirm={onCancelTask}
              destructive
            />
          )}
        </div>
      </div>

      {/* Status + metadata + transitions — all in one clean row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Status badge */}
        <span
          className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold"
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
                className={
                  "inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] " +
                  "font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                }
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
              </button>
            ))}
          </>
        )}

        {/* Divider */}
        <span className="mx-1 h-4 w-px bg-border" />

        {/* Space */}
        {task.space && (
          <Link
            href={`/tasks?space=${task.space.id}`}
            className={
              "inline-flex h-6 items-center gap-1.5 rounded-full bg-shell-chip px-2.5 text-xs font-medium " +
              "text-muted-foreground transition-colors hover:text-foreground"
            }
          >
            <MapPin className="size-3" />
            {task.space.name}
          </Link>
        )}

        {/* Phase */}
        {hasModule("phases") && task.phase && (
          <span
            className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium"
            style={{ backgroundColor: `${task.phase.color}14`, color: task.phase.color }}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: task.phase.color }} />
            {task.phase.name}
          </span>
        )}

        {/* Sprint */}
        {hasModule("sprints") && task.sprint && (
          <span className="inline-flex h-6 items-center rounded-full bg-shell-accent-soft px-2.5 text-xs font-medium text-shell-accent">
            {task.sprint.name}
          </span>
        )}

        {/* Story Points */}
        {hasModule("story_points") && task.storyPoints != null && (
          <span
            className={
              "inline-flex h-6 items-center rounded-full bg-shell-chip px-2.5 text-xs font-bold tabular-nums " +
              "text-muted-foreground"
            }
          >
            {t("tasks.units.points", { count: task.storyPoints })}
          </span>
        )}

        {/* Epic */}
        {hasModule("epics") && task.epic && (
          <span
            className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium"
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

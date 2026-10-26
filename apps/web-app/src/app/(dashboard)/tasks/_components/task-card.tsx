"use client"

import { isOpenToRole } from "@hbcfield/shared/client"
import { OpenRoleChip } from "./open-role-chip"

import { PausedChip } from "@/components/tasks/paused-chip"
import React from "react"
import { isTaskOverdue } from "@hbcfield/shared/client"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { PriorityTag } from "./task-row-when"
import { TaskAssigneesStack, TaskPersonAvatar } from "./task-avatars"
import { useAuth } from "@/contexts/auth-context"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { getPriorityConfig } from "@/lib/constants"
import type { Task, Sprint, Phase, Epic } from "@/lib/api"
import { TaskContextMenu, type TaskContextMenuActions } from "./task-context-menu"
import { dateLocale } from "@/lib/format-date"

const APPLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

interface TaskCardProps {
  task: Task
  index: number
  isDragging: boolean
  onAssignClick?: (taskId: string) => void
  contextActions?: TaskContextMenuActions
  sprints?: Sprint[]
  phases?: Phase[]
  epics?: Epic[]
  spaces?: { id: string; name: string }[]
  recentAssignees?: { id: string; firstName: string; lastName: string }[]
  dragProps?: React.HTMLAttributes<HTMLDivElement>
  className?: string
}

export const TaskCard = React.memo(function TaskCard({
  task,
  index,
  isDragging,
  onAssignClick,
  contextActions,
  sprints,
  phases,
  epics,
  spaces,
  recentAssignees,
  dragProps,
  className,
}: TaskCardProps) {
  const { t } = useTranslation()
  /*
    Modules are the SPACE's, and a board can show tasks from several spaces at
    once — so the row asks about its OWN task's space rather than the
    organization's set. Cached per space by the hook, so a board of fifty rows
    from three spaces makes three lookups, not fifty.
  */
  const { hasModule: orgHasModule } = useAuth()
  const { hasModule: spaceHasModule } = useSpaceModules(task.spaceId ?? null)
  const hasModule = task.spaceId ? spaceHasModule : orgHasModule
  const priorityConfig = getPriorityConfig(task.priority)
  const isOverdue = isTaskOverdue(task)

  const where = task.locationAddress || task.space?.name || null

  const cardContent = (
    <div
      draggable
      {...dragProps}
      className={cn(
        "flex flex-col gap-2.5 rounded-[18px] border-2 border-transparent bg-card px-4 py-3.5 shadow-shell",
        "cursor-grab select-none transition-all duration-200 active:cursor-grabbing",
        "group/card",
        isDragging && "scale-95 opacity-30",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <Link
          href={`/tasks/${task.id}`}
          draggable={false}
          className="line-clamp-2 text-[14.5px] font-semibold text-foreground hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {task.title}
          <PriorityTag priority={task.priority} label={priorityConfig.label} />
        </Link>
        {where && <span className="truncate text-[13px] text-muted-foreground">{where}</span>}
      </div>

      {(task.pausedAt || (hasModule("story_points") && task.storyPoints != null)) && (
        <div className="flex items-center gap-1.5">
          <PausedChip task={task} />
          {hasModule("story_points") && task.storyPoints != null && (
            <span className="rounded-full bg-shell-chip px-2 text-[11px] font-bold tabular-nums text-muted-foreground">
              {task.storyPoints}
            </span>
          )}
        </div>
      )}

      {task.checklistItems &&
        task.checklistItems.length > 0 &&
        (() => {
          const done = task.checklistItems.filter((i) => i.isCompleted).length
          const total = task.checklistItems.length
          const pct = (done / total) * 100
          return (
            <div className="flex items-center gap-2">
              <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-shell-accent"
                  style={{ width: `${pct}%`, transition: `width 0.3s ${APPLE_EASE}` }}
                />
              </div>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {done}/{total}
              </span>
            </div>
          )
        })()}

      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "text-[13px] tabular-nums",
            isOverdue ? "font-semibold text-shell-crit" : "text-muted-foreground",
          )}
        >
          {task.dueDate
            ? new Date(task.dueDate).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" })
            : null}
        </span>

        {/* Assignee area — always clickable to open assign dialog */}
        <div
          className="-mx-1 flex cursor-pointer items-center rounded-full px-1 py-0.5 transition-colors hover:bg-shell-chip"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onAssignClick?.(task.id)
          }}
          title={t("tasks.card.manageAssignees")}
        >
          {task.assignees && task.assignees.length > 0 ? (
            <TaskAssigneesStack assignees={task.assignees} />
          ) : task.assignedTo ? (
            <div className="flex items-center gap-1.5">
              <TaskPersonAvatar person={task.assignedTo} />
              <span className="max-w-[80px] truncate text-xs text-muted-foreground">{task.assignedTo.firstName}</span>
            </div>
          ) : isOpenToRole(task) ? (
            <OpenRoleChip task={task} />
          ) : (
            <span
              className={
                "inline-flex h-7 items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold " +
                "text-primary-foreground"
              }
            >
              <Plus className="size-3" />
              {t("tasks.card.assign")}
            </span>
          )}
        </div>
      </div>
    </div>
  )

  if (contextActions) {
    return (
      <TaskContextMenu
        task={task}
        sprints={sprints}
        phases={phases}
        epics={epics}
        spaces={spaces}
        actions={contextActions}
        recentAssignees={recentAssignees}
      >
        {cardContent}
      </TaskContextMenu>
    )
  }

  return cardContent
})

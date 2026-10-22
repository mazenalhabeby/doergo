"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { GripVertical } from "lucide-react"
import { isTaskOverdue } from "@hbcfield/shared/client"
import { PausedChip } from "@/components/tasks/paused-chip"
import { useAuth } from "@/contexts/auth-context"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { getPriorityConfig } from "@/lib/constants"
import { dateLocale } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import type { Task, Sprint, Phase, Epic } from "@/lib/api"
import { TaskContextMenu, type TaskContextMenuActions } from "./task-context-menu"
import { TaskRowAssigneeCell } from "./task-row-assignee-cell"
import { TaskRowStatusCell } from "./task-row-status-cell"
import { useTaskRowStatus } from "./use-task-row-status"

export interface TaskTableRowProps {
  task: Task
  index: number
  canAssign: boolean
  onAssign: (taskId: string) => void
  isSelected?: boolean
  onToggleSelect?: (taskId: string, shiftKey: boolean) => void
  hasAnySelected?: boolean
  sprints?: Sprint[]
  phases?: Phase[]
  epics?: Epic[]
  spaces?: { id: string; name: string }[]
  contextActions?: TaskContextMenuActions
  recentAssignees?: { id: string; firstName: string; lastName: string }[]
  // Drag props
  draggable?: boolean
  onDragStart?: (e: React.DragEvent, taskId: string) => void
  isDragging?: boolean
}

/** One task in the list view: step dot, title, priority, assignee, due date, step — the row opens the task. */
function TaskTableRowInner({
  task,
  onAssign,
  sprints,
  phases,
  epics,
  spaces,
  contextActions,
  recentAssignees,
  draggable = false,
  onDragStart,
  isDragging = false,
}: TaskTableRowProps) {
  /*
    Modules are the SPACE's, and a board can show tasks from several spaces at
    once — so the row asks about its OWN task's space rather than the
    organization's set. Cached per space by the hook, so a board of fifty rows
    from three spaces makes three lookups, not fifty.
  */
  const { hasModule: orgHasModule } = useAuth()
  const { hasModule: spaceHasModule } = useSpaceModules(task.spaceId ?? null)
  const hasModule = task.spaceId ? spaceHasModule : orgHasModule
  const router = useRouter()

  const status = useTaskRowStatus(task, contextActions?.onStatusChange)
  const { statusConfig } = status
  const priorityConfig = getPriorityConfig(task.priority)
  const PriorityIcon = priorityConfig.icon

  const isOverdue = isTaskOverdue(task)

  const formattedDueDate = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" })
    : null

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on action buttons or drag handle
    const target = e.target as HTMLElement
    if (target.closest("[data-no-navigate]")) return
    router.push(`/tasks/${task.id}`)
  }

  const rowContent = (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id)
        e.dataTransfer.effectAllowed = "move"
        if (onDragStart) onDragStart(e, task.id)
      }}
      onClick={handleRowClick}
      className={cn(
        "group grid grid-cols-[24px_1fr_100px_160px_110px_110px_40px] items-center px-3 h-11",
        "border-b border-border/20 last:border-b-0",
        "hover:bg-muted/40 transition-colors duration-100",
        "cursor-pointer select-none",
        isDragging && "opacity-30 scale-[0.98]",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      {/* Drag handle — only visible when draggable */}
      <div
        data-no-navigate
        className={cn(
          "flex items-center justify-center transition-opacity",
          draggable ? "opacity-0 group-hover:opacity-40" : "opacity-0",
        )}
      >
        {draggable && <GripVertical className="size-3.5" />}
      </div>

      {/* Title + Status Dot */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="size-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusConfig.hex }} />
        <span
          className={
            "text-sm font-medium text-foreground truncate group-hover:text-blue-600 " +
            "dark:group-hover:text-blue-400 transition-colors duration-100"
          }
        >
          {task.title}
        </span>
        <PausedChip task={task} className="flex-shrink-0" />
      </div>

      {/* Priority */}
      <div className="flex items-center gap-1.5 w-[100px] flex-shrink-0">
        <PriorityIcon className="size-3.5 flex-shrink-0" style={{ color: priorityConfig.hex }} />
        <span className="text-xs font-medium" style={{ color: priorityConfig.hex }}>
          {priorityConfig.label}
        </span>
        {hasModule("story_points") && task.storyPoints != null && (
          <span className="bg-muted rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground ml-1">
            {task.storyPoints}
          </span>
        )}
      </div>

      <TaskRowAssigneeCell task={task} onAssign={onAssign} />

      {/* Due Date */}
      <div className="flex items-center gap-1.5 w-[110px] flex-shrink-0">
        {formattedDueDate ? (
          <span className={cn("text-xs", isOverdue ? "text-red-500 font-medium" : "text-muted-foreground")}>
            {formattedDueDate}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/30">—</span>
        )}
      </div>

      <TaskRowStatusCell task={task} status={status} onStatusChange={contextActions?.onStatusChange} />

      {/* Spacer for grid alignment */}
      <div />
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
        {rowContent}
      </TaskContextMenu>
    )
  }

  return rowContent
}

export const TaskTableRow = React.memo(TaskTableRowInner)

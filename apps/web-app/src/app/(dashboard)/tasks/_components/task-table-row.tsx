"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { GripVertical } from "lucide-react"
import { PausedChip } from "@/components/tasks/paused-chip"
import { useAuth } from "@/contexts/auth-context"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { getPriorityConfig } from "@/lib/constants"
import { cn } from "@/lib/utils"
import type { Task, Sprint, Phase, Epic } from "@/lib/api"
import { TaskContextMenu, type TaskContextMenuActions } from "./task-context-menu"
import { TaskRowAssigneeCell } from "./task-row-assignee-cell"
import { TaskRowStatusCell } from "./task-row-status-cell"
import { useTaskRowStatus } from "./use-task-row-status"
import { PriorityTag, TaskRowWhen } from "./task-row-when"

/** The list's columns: handle · when · what · step · who (the boards' `krow`). Header and rows share it. */
export const TASK_ROW_GRID = "grid-cols-[14px_64px_minmax(0,1fr)_140px_150px]"

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

/** One task in the list view: when, title + priority + where, step, who — the row opens the task. */
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
  const priorityConfig = getPriorityConfig(task.priority)
  // The line under the title: where the job is, else the workspace it belongs to.
  const where = task.locationAddress || task.space?.name || null

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
        "group grid items-center gap-3 rounded-[18px] px-2.5 py-2 transition-colors duration-100",
        TASK_ROW_GRID,
        "cursor-pointer select-none hover:bg-accent",
        isDragging && "scale-[0.98] opacity-30",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      {/* Drag handle — only visible when draggable */}
      <div
        data-no-navigate
        className={cn(
          "flex items-center justify-center text-muted-foreground transition-opacity",
          draggable ? "opacity-0 group-hover:opacity-60" : "opacity-0",
        )}
      >
        {draggable && <GripVertical className="size-3.5" />}
      </div>

      <TaskRowWhen task={task} />

      {/* What: the title with its priority, and where */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center">
          <span className="truncate text-[15px] font-semibold text-foreground">{task.title}</span>
          <PriorityTag priority={task.priority} label={priorityConfig.label} />
          {hasModule("story_points") && task.storyPoints != null && (
            <span className="ml-2 rounded-full bg-shell-chip px-2 text-[11px] font-bold tabular-nums text-muted-foreground">
              {task.storyPoints}
            </span>
          )}
          <PausedChip task={task} className="ml-2 flex-shrink-0" />
        </span>
        {where && <span className="truncate text-[13px] text-muted-foreground">{where}</span>}
      </div>

      <TaskRowStatusCell task={task} status={status} onStatusChange={contextActions?.onStatusChange} />

      <TaskRowAssigneeCell task={task} onAssign={onAssign} />
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

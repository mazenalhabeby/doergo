"use client"

import React from "react"
import { useRouter } from "next/navigation"
import {
  GripVertical,
  UserPlus,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { UserAvatar, StackedAvatars } from "@/components/user-avatar"
import { useAuth } from "@/contexts/auth-context"
import { getStatusConfig, getPriorityConfig } from "@/lib/constants"
import type { Task, Sprint, Phase, Epic } from "@/lib/api"
import { TaskContextMenu, type TaskContextMenuActions } from "./task-context-menu"

interface TaskTableRowProps {
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

function TaskTableRowInner({
  task,
  index,
  canAssign,
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
  const { hasModule } = useAuth()
  const router = useRouter()
  const statusConfig = getStatusConfig(task.status)
  const priorityConfig = getPriorityConfig(task.priority)
  const PriorityIcon = priorityConfig.icon

  const isOverdue =
    task.dueDate &&
    new Date(task.dueDate) < new Date() &&
    !["COMPLETED", "CLOSED", "CANCELED"].includes(task.status)

  const formattedDueDate = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
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
        <span className="text-sm font-medium text-foreground truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-100">
          {task.title}
        </span>
      </div>

      {/* Priority */}
      <div className="flex items-center gap-1.5 w-[100px] flex-shrink-0">
        <PriorityIcon className="size-3.5 flex-shrink-0" style={{ color: priorityConfig.hex }} />
        <span className="text-xs font-medium" style={{ color: priorityConfig.hex }}>
          {priorityConfig.label}
        </span>
        {hasModule('story_points') && task.storyPoints != null && (
          <span className="bg-muted rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground ml-1">
            {task.storyPoints}
          </span>
        )}
      </div>

      {/* Assignee(s) — clickable to open assign dialog */}
      <div
        data-no-navigate
        className="flex items-center gap-2 min-w-0 w-[160px] flex-shrink-0 rounded-md px-1.5 py-1 -mx-1.5 hover:bg-muted/60 cursor-pointer transition-colors"
        onClick={(e) => { e.stopPropagation(); onAssign(task.id) }}
        title="Click to manage assignees"
      >
        {task.assignees && task.assignees.length > 0 ? (
          <div className="flex items-center">
            <StackedAvatars
              users={task.assignees.map((a) => ({ id: a.user.id, firstName: a.user.firstName, lastName: a.user.lastName, avatarUrl: a.user.avatarUrl }))}
              max={3}
              size="xs"
            />
            {task.assignees.length <= 2 && (
              <span className="text-xs text-muted-foreground truncate ml-2">
                {task.assignees[0]!.user.firstName} {task.assignees[0]!.user.lastName}
              </span>
            )}
          </div>
        ) : task.assignedTo ? (
          <div className="flex items-center gap-1.5">
            <UserAvatar
              firstName={task.assignedTo.firstName}
              lastName={task.assignedTo.lastName}
              avatarUrl={task.assignedTo.avatarUrl}
              seed={task.assignedTo.id}
              size="xs"
            />
            <span className="text-xs text-muted-foreground truncate">
              {task.assignedTo.firstName} {task.assignedTo.lastName}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/40 flex items-center gap-1">
            <UserPlus className="size-3" />
            Assign
          </span>
        )}
      </div>

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

      {/* Status Badge */}
      <div className="w-[110px] flex-shrink-0">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ backgroundColor: `${statusConfig.hex}14`, color: statusConfig.hex }}
        >
          <span className="size-1.5 rounded-full" style={{ backgroundColor: statusConfig.hex }} />
          {statusConfig.label}
        </span>
      </div>

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

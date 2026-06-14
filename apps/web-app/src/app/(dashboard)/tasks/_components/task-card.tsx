"use client"

import React from "react"
import Link from "next/link"
import { Calendar, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { UserAvatar, StackedAvatars } from "@/components/user-avatar"
import { useAuth } from "@/contexts/auth-context"
import { getPriorityConfig } from "@/lib/constants"
import type { Task, Sprint, Phase, Epic } from "@/lib/api"
import { TaskContextMenu, type TaskContextMenuActions } from "./task-context-menu"

const APPLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

export interface TaskCardProps {
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
  const { hasModule } = useAuth()
  const priorityConfig = getPriorityConfig(task.priority)
  const PriorityIcon = priorityConfig.icon
  const isOverdue =
    task.dueDate &&
    new Date(task.dueDate) < new Date() &&
    !["COMPLETED", "CLOSED", "CANCELED"].includes(task.status)

  const cardContent = (
    <div
      draggable
      {...dragProps}
      className={cn(
        "p-3.5 rounded-xl bg-card border border-border/60 shadow-sm dark:shadow-none",
        "hover:border-border hover:shadow-md",
        "transition-all duration-200 cursor-grab active:cursor-grabbing select-none",
        "group/card",
        isDragging && "opacity-30 scale-95",
        className,
      )}
      style={undefined}
    >
      <Link
        href={`/tasks/${task.id}`}
        draggable={false}
        className="text-sm font-medium text-foreground mb-2.5 line-clamp-2 group-hover/card:text-blue-600 transition-colors duration-150 block"
        onClick={(e) => e.stopPropagation()}
      >
        {task.title}
      </Link>

      <div className="flex items-center gap-1.5 mb-3">
        <PriorityIcon className="size-3" style={{ color: priorityConfig.hex }} />
        <span className="text-[11px] font-medium" style={{ color: priorityConfig.hex }}>
          {priorityConfig.label}
        </span>
        {hasModule('story_points') && task.storyPoints != null && (
          <span className="bg-muted rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground ml-auto">
            {task.storyPoints}
          </span>
        )}
      </div>

      {task.checklistItems && task.checklistItems.length > 0 && (() => {
        const done = task.checklistItems.filter((i) => i.isCompleted).length
        const total = task.checklistItems.length
        const pct = (done / total) * 100
        return (
          <div className="mb-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">{done}/{total}</span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full", pct === 100 ? "bg-green-500" : "bg-blue-500")}
                style={{ width: `${pct}%`, transition: `width 0.3s ${APPLE_EASE}` }}
              />
            </div>
          </div>
        )
      })()}

      <div className="flex items-center justify-between">
        {/* Assignee area — always clickable to open assign dialog */}
        <div
          className="flex items-center cursor-pointer rounded-md px-1 py-0.5 -mx-1 hover:bg-muted/50 transition-colors"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAssignClick?.(task.id) }}
          title="Manage assignees"
        >
          {task.assignees && task.assignees.length > 0 ? (
            <StackedAvatars
              users={task.assignees.map((a) => ({ id: a.user.id, firstName: a.user.firstName, lastName: a.user.lastName, avatarUrl: a.user.avatarUrl }))}
              max={3}
              size="xs"
            />
          ) : task.assignedTo ? (
            <div className="flex items-center gap-1.5">
              <UserAvatar
                firstName={task.assignedTo.firstName}
                lastName={task.assignedTo.lastName}
                avatarUrl={task.assignedTo.avatarUrl}
                seed={task.assignedTo.id}
                size="xs"
              />
              <span className="text-[11px] text-muted-foreground truncate max-w-[80px]">
                {task.assignedTo.firstName}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
              <div className="size-5 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                <Plus className="size-2.5 text-muted-foreground/40" />
              </div>
              <span className="text-[11px] text-muted-foreground/40">Assign</span>
            </div>
          )}
        </div>

        {task.dueDate && (
          <div className="flex items-center gap-1">
            <Calendar className={cn("size-3", isOverdue ? "text-red-500" : "text-muted-foreground/60")} />
            <span className={cn("text-[11px]", isOverdue ? "text-red-500 font-medium" : "text-muted-foreground/60")}>
              {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </div>
        )}
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

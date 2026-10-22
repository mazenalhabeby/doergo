import type React from "react"
import type { Task, Sprint, Phase, Epic } from "@/lib/api"

/** What a task's right-click menu can do — each action present only where the view allows it. */
export interface TaskContextMenuActions {
  onStatusChange?: (taskId: string, status: string) => void
  onPriorityChange?: (taskId: string, priority: string) => void
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void
  onSprintChange?: (taskId: string, sprintId: string | null) => void
  onPhaseChange?: (taskId: string, phaseId: string | null) => void
  onEpicChange?: (taskId: string, epicId: string | null) => void
  onStoryPointsChange?: (taskId: string, points: number | null) => void
  onSpaceChange?: (taskId: string, spaceId: string | null) => void
  onDelete?: (taskId: string) => void
}

export interface TaskContextMenuProps {
  task: Task
  children: React.ReactNode
  sprints?: Sprint[]
  phases?: Phase[]
  epics?: Epic[]
  spaces?: { id: string; name: string }[]
  actions: TaskContextMenuActions
  /** Unique assignees from recent tasks for quick assign */
  recentAssignees?: { id: string; firstName: string; lastName: string }[]
}

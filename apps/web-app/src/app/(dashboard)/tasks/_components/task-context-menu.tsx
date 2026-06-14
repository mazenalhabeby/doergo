"use client"

import React from "react"
import { useRouter } from "next/navigation"
import {
  ExternalLink,
  Trash2,
  ArrowRight,
  Archive,
  MapPin,
} from "lucide-react"
import { UserAvatar } from "@/components/user-avatar"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useAuth } from "@/contexts/auth-context"
import { getStatusConfig, getPriorityConfig, TASK_STATUSES, TASK_PRIORITIES } from "@/lib/constants"
import type { Task, Sprint, Phase, Epic } from "@/lib/api"
import { STORY_POINT_OPTIONS } from "@/lib/api"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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

interface TaskContextMenuProps {
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
function TaskContextMenuInner({
  task,
  children,
  sprints = [],
  phases = [],
  epics = [],
  spaces = [],
  actions,
  recentAssignees = [],
}: TaskContextMenuProps) {
  const router = useRouter()
  const { hasModule } = useAuth()

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-[200px]">
        {/* Open */}
        <ContextMenuItem onClick={() => router.push(`/tasks/${task.id}`)}>
          <ExternalLink className="size-4 mr-2" />
          Open
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Status submenu */}
        {actions.onStatusChange && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <span
                className="size-2 rounded-full mr-2 flex-shrink-0"
                style={{ backgroundColor: getStatusConfig(task.status).hex }}
              />
              Status
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-[180px]">
              {TASK_STATUSES.filter(s => s !== "DRAFT").map((status) => {
                const config = getStatusConfig(status)
                const isCurrent = task.status === status
                return (
                  <ContextMenuItem
                    key={status}
                    disabled={isCurrent}
                    onClick={() => actions.onStatusChange!(task.id, status)}
                    className={isCurrent ? "opacity-50" : ""}
                  >
                    <span
                      className="size-2 rounded-full mr-2 flex-shrink-0"
                      style={{ backgroundColor: config.hex }}
                    />
                    {config.label}
                  </ContextMenuItem>
                )
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {/* Priority submenu */}
        {actions.onPriorityChange && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              {(() => {
                const pc = getPriorityConfig(task.priority)
                const Icon = pc.icon
                return <Icon className="size-3.5 mr-2 flex-shrink-0" style={{ color: pc.hex }} />
              })()}
              Priority
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-[160px]">
              {TASK_PRIORITIES.map((priority) => {
                const config = getPriorityConfig(priority)
                const Icon = config.icon
                const isCurrent = task.priority === priority
                return (
                  <ContextMenuItem
                    key={priority}
                    disabled={isCurrent}
                    onClick={() => actions.onPriorityChange!(task.id, priority)}
                    className={isCurrent ? "opacity-50" : ""}
                  >
                    <Icon className="size-3.5 mr-2 flex-shrink-0" style={{ color: config.hex }} />
                    {config.label}
                  </ContextMenuItem>
                )
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {/* Assign to submenu */}
        {actions.onAssigneeChange && recentAssignees.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <span className="size-4 mr-2 flex-shrink-0 flex items-center justify-center">
                <span className="size-3 rounded-full bg-gradient-to-br from-blue-500 to-blue-600" />
              </span>
              Assign to
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-[180px]">
              <ContextMenuItem
                onClick={() => actions.onAssigneeChange!(task.id, null)}
                disabled={!task.assignedToId}
                className={!task.assignedToId ? "opacity-50" : ""}
              >
                Unassigned
              </ContextMenuItem>
              {recentAssignees.map((a) => {
                const isCurrent = task.assignedToId === a.id
                return (
                  <ContextMenuItem
                    key={a.id}
                    disabled={isCurrent}
                    onClick={() => actions.onAssigneeChange!(task.id, a.id)}
                    className={isCurrent ? "opacity-50" : ""}
                  >
                    <UserAvatar
                      firstName={a.firstName}
                      lastName={a.lastName}
                      seed={a.id}
                      size="xs"
                      className="mr-2"
                    />
                    {a.firstName} {a.lastName}
                  </ContextMenuItem>
                )
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        <ContextMenuSeparator />

        {/* Move to Sprint submenu */}
        {hasModule('sprints') && actions.onSprintChange && sprints.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <ArrowRight className="size-4 mr-2 flex-shrink-0" />
              Move to Sprint
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-[180px]">
              <ContextMenuItem
                onClick={() => actions.onSprintChange!(task.id, null)}
                disabled={!task.sprintId}
                className={!task.sprintId ? "opacity-50" : ""}
              >
                <Archive className="size-3.5 mr-2" />
                Backlog
              </ContextMenuItem>
              {sprints.map((sprint) => {
                const isCurrent = task.sprintId === sprint.id
                return (
                  <ContextMenuItem
                    key={sprint.id}
                    disabled={isCurrent}
                    onClick={() => actions.onSprintChange!(task.id, sprint.id)}
                    className={isCurrent ? "opacity-50" : ""}
                  >
                    {sprint.name}
                  </ContextMenuItem>
                )
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {/* Set Phase submenu */}
        {hasModule('phases') && actions.onPhaseChange && phases.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <span className="size-4 mr-2 flex-shrink-0 flex items-center justify-center">
                <span className="size-2 rounded-full bg-muted-foreground/40" />
              </span>
              Set Phase
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-[180px]">
              <ContextMenuItem
                onClick={() => actions.onPhaseChange!(task.id, null)}
                disabled={!task.phaseId}
                className={!task.phaseId ? "opacity-50" : ""}
              >
                No Phase
              </ContextMenuItem>
              {phases.map((phase) => {
                const isCurrent = task.phaseId === phase.id
                return (
                  <ContextMenuItem
                    key={phase.id}
                    disabled={isCurrent}
                    onClick={() => actions.onPhaseChange!(task.id, phase.id)}
                    className={isCurrent ? "opacity-50" : ""}
                  >
                    <span
                      className="size-2 rounded-full mr-2 flex-shrink-0"
                      style={{ backgroundColor: phase.color }}
                    />
                    {phase.name}
                  </ContextMenuItem>
                )
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {/* Set Epic submenu */}
        {hasModule('epics') && actions.onEpicChange && epics.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <span className="size-4 mr-2 flex-shrink-0 flex items-center justify-center">
                <span className="size-2 rounded-full bg-purple-400" />
              </span>
              Set Epic
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-[180px]">
              <ContextMenuItem
                onClick={() => actions.onEpicChange!(task.id, null)}
                disabled={!task.epicId}
                className={!task.epicId ? "opacity-50" : ""}
              >
                No Epic
              </ContextMenuItem>
              {epics.map((epic) => {
                const isCurrent = task.epicId === epic.id
                return (
                  <ContextMenuItem
                    key={epic.id}
                    disabled={isCurrent}
                    onClick={() => actions.onEpicChange!(task.id, epic.id)}
                    className={isCurrent ? "opacity-50" : ""}
                  >
                    <span
                      className="size-2 rounded-full mr-2 flex-shrink-0"
                      style={{ backgroundColor: epic.color }}
                    />
                    {epic.name}
                  </ContextMenuItem>
                )
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {/* Move to Space submenu */}
        {actions.onSpaceChange && spaces.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <MapPin className="size-4 mr-2 flex-shrink-0" />
              Move to Space
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-[180px]">
              <ContextMenuItem
                onClick={() => actions.onSpaceChange!(task.id, null)}
                disabled={!task.spaceId}
                className={!task.spaceId ? "opacity-50" : ""}
              >
                No Space
              </ContextMenuItem>
              {spaces.map((space) => {
                const isCurrent = task.spaceId === space.id
                return (
                  <ContextMenuItem
                    key={space.id}
                    disabled={isCurrent}
                    onClick={() => actions.onSpaceChange!(task.id, space.id)}
                    className={isCurrent ? "opacity-50" : ""}
                  >
                    <MapPin className="size-3 mr-2 flex-shrink-0 text-muted-foreground" />
                    {space.name}
                  </ContextMenuItem>
                )
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {/* Story Points submenu */}
        {hasModule('story_points') && actions.onStoryPointsChange && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <span className="size-4 mr-2 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                {task.storyPoints ?? "#"}
              </span>
              Story Points
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-[140px]">
              <ContextMenuItem
                onClick={() => actions.onStoryPointsChange!(task.id, null)}
                disabled={task.storyPoints == null}
                className={task.storyPoints == null ? "opacity-50" : ""}
              >
                None
              </ContextMenuItem>
              {STORY_POINT_OPTIONS.map((pts) => {
                const isCurrent = task.storyPoints === pts
                return (
                  <ContextMenuItem
                    key={pts}
                    disabled={isCurrent}
                    onClick={() => actions.onStoryPointsChange!(task.id, pts)}
                    className={isCurrent ? "opacity-50" : ""}
                  >
                    <span className="text-xs font-bold tabular-nums mr-2">{pts}</span>
                    point{pts !== 1 ? "s" : ""}
                  </ContextMenuItem>
                )
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {(actions.onSprintChange || actions.onPhaseChange || actions.onEpicChange || actions.onStoryPointsChange || actions.onSpaceChange) && <ContextMenuSeparator />}

        {/* Delete */}
        {actions.onDelete && (
          <ContextMenuItem
            onClick={() => {
              if (window.confirm(`Delete "${task.title}"?`)) {
                actions.onDelete!(task.id)
              }
            }}
            className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-500/10"
          >
            <Trash2 className="size-4 mr-2" />
            Delete
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

export const TaskContextMenu = React.memo(TaskContextMenuInner)

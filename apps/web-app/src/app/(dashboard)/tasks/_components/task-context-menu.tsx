"use client"

import React from "react"
import {
  ExternalLink,
  Trash2,
  ArrowRight,
  Archive,
  MapPin,
} from "lucide-react"
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
import { getPriorityConfig, TASK_PRIORITIES } from "@/lib/constants"
import { STORY_POINT_OPTIONS } from "@/lib/api"
import { useTaskContextMenuInner, type TaskContextMenuProps } from "./use-task-context-menu-inner"
import { TaskContextMenuInnerMenu } from "./task-context-menu-inner-menu"
import { TaskContextMenuInnerMenu2 } from "./task-context-menu-inner-menu2"
import { TaskContextMenuInnerMenu3 } from "./task-context-menu-inner-menu3"
export { type TaskContextMenuActions } from "./use-task-context-menu-inner"

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TaskContextMenuInner({
  task,
  children,
  sprints = [],
  phases = [],
  epics = [],
  spaces = [],
  actions,
  recentAssignees = [],
}: TaskContextMenuProps) {
  const vm = useTaskContextMenuInner({ task, children, sprints, phases, epics, spaces, actions, recentAssignees })
  const {
    t,
    flowStatuses,
    statusOptions,
    currentIsFinished,
    allowedTargets,
    isManager,
    router,
    hasModule,
  } = vm

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-[200px]">
        {/* Open */}
        <ContextMenuItem onClick={() => router.push(`/tasks/${task.id}`)}>
          <ExternalLink className="size-4 mr-2" />
          {t("tasks.menu.open")}
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Status submenu */}
        <TaskContextMenuInnerMenu vm={vm} actions={actions} task={task} />

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
        <TaskContextMenuInnerMenu2 vm={vm} actions={actions} recentAssignees={recentAssignees} task={task} />

        <ContextMenuSeparator />

        {/* Move to Sprint submenu */}
        {hasModule('sprints') && actions.onSprintChange && sprints.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <ArrowRight className="size-4 mr-2 flex-shrink-0" />
              {t("tasks.menu.moveToSprint")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-[180px]">
              <ContextMenuItem
                onClick={() => actions.onSprintChange!(task.id, null)}
                disabled={!task.sprintId}
                className={!task.sprintId ? "opacity-50" : ""}
              >
                <Archive className="size-3.5 mr-2" />
                {t("tasks.menu.backlog")}
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
        <TaskContextMenuInnerMenu3 vm={vm} actions={actions} phases={phases} task={task} />

        {/* Set Epic submenu */}
        {hasModule('epics') && actions.onEpicChange && epics.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <span className="size-4 mr-2 flex-shrink-0 flex items-center justify-center">
                <span className="size-2 rounded-full bg-purple-400" />
              </span>
              {t("tasks.menu.setEpic")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-[180px]">
              <ContextMenuItem
                onClick={() => actions.onEpicChange!(task.id, null)}
                disabled={!task.epicId}
                className={!task.epicId ? "opacity-50" : ""}
              >
                {t("tasks.menu.noEpic")}
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
              {t("tasks.menu.moveToSpace")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-[180px]">
              <ContextMenuItem
                onClick={() => actions.onSpaceChange!(task.id, null)}
                disabled={!task.spaceId}
                className={!task.spaceId ? "opacity-50" : ""}
              >
                {t("tasks.menu.noSpace")}
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
              {t("tasks.menu.storyPoints")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-[140px]">
              <ContextMenuItem
                onClick={() => actions.onStoryPointsChange!(task.id, null)}
                disabled={task.storyPoints == null}
                className={task.storyPoints == null ? "opacity-50" : ""}
              >
                {t("tasks.menu.none")}
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

        {(actions.onSprintChange ||
          actions.onPhaseChange ||
          actions.onEpicChange ||
          actions.onStoryPointsChange ||
          actions.onSpaceChange) &&
          <ContextMenuSeparator />}

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
            {t("tasks.menu.delete")}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

export const TaskContextMenu = React.memo(TaskContextMenuInner)

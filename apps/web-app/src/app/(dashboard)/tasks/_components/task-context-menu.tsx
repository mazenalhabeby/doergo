"use client"

import React from "react"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { ExternalLink, Trash2 } from "lucide-react"
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
import type { TaskContextMenuProps } from "./task-context-menu-types"
import { TaskStatusSubmenu } from "./task-status-submenu"
import { TaskAssignSubmenu } from "./task-assign-submenu"
import { TaskPlanningSubmenus } from "./task-planning-submenus"
export { type TaskContextMenuActions } from "./task-context-menu-types"

/** A task's right-click menu: open, status, priority, assignee, planning, delete. */
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
  const { t } = useTranslation()
  const router = useRouter()

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
        <TaskStatusSubmenu task={task} onStatusChange={actions.onStatusChange} />

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
        <TaskAssignSubmenu task={task} recentAssignees={recentAssignees} onAssigneeChange={actions.onAssigneeChange} />

        <ContextMenuSeparator />

        {/* Sprint, phase, epic, workspace, story points */}
        <TaskPlanningSubmenus
          task={task}
          sprints={sprints}
          phases={phases}
          epics={epics}
          spaces={spaces}
          actions={actions}
        />

        {(actions.onSprintChange ||
          actions.onPhaseChange ||
          actions.onEpicChange ||
          actions.onStoryPointsChange ||
          actions.onSpaceChange) && <ContextMenuSeparator />}

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

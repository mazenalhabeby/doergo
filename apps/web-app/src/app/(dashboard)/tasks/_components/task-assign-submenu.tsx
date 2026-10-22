"use client"

import { useTranslation } from "react-i18next"
import { UserAvatar } from "@/components/common/user-avatar"
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import { personName } from "@hbcfield/shared/client"
import type { Task } from "@/lib/api"
import type { TaskContextMenuActions, TaskContextMenuProps } from "./task-context-menu-types"

/** The context menu's "Assign to" submenu: unassigned, or one of the people recently assigned. */
export function TaskAssignSubmenu({
  task,
  recentAssignees,
  onAssigneeChange,
}: {
  task: Task
  recentAssignees: NonNullable<TaskContextMenuProps["recentAssignees"]>
  onAssigneeChange: TaskContextMenuActions["onAssigneeChange"]
}) {
  const { t } = useTranslation()
  return (
    <>
      {onAssigneeChange && recentAssignees.length > 0 && (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span className="size-4 mr-2 flex-shrink-0 flex items-center justify-center">
              <span className="size-3 rounded-full bg-gradient-to-br from-blue-500 to-blue-600" />
            </span>
            {t("tasks.menu.assignTo")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-[180px]">
            <ContextMenuItem
              onClick={() => onAssigneeChange(task.id, null)}
              disabled={!task.assignedToId}
              className={!task.assignedToId ? "opacity-50" : ""}
            >
              {t("tasks.menu.unassigned")}
            </ContextMenuItem>
            {recentAssignees.map((a) => {
              const isCurrent = task.assignedToId === a.id
              return (
                <ContextMenuItem
                  key={a.id}
                  disabled={isCurrent}
                  onClick={() => onAssigneeChange(task.id, a.id)}
                  className={isCurrent ? "opacity-50" : ""}
                >
                  <UserAvatar firstName={a.firstName} lastName={a.lastName} seed={a.id} size="xs" className="mr-2" />
                  {personName(a)}
                </ContextMenuItem>
              )
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}
    </>
  )
}

"use client"

import { UserAvatar } from "@/components/user-avatar"
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import { personName } from "@hbcfield/shared/client"
import type { TaskContextMenuInnerState } from "./use-task-context-menu-inner"
import type { TaskContextMenuInner } from "./task-context-menu"

/** Part of TaskContextMenuInner's markup, moved here unchanged; it reads the page's state from `vm`. */
export function TaskContextMenuInnerMenu2(
  {
    vm,
    actions,
    recentAssignees,
    task
  }: {
    vm: TaskContextMenuInnerState;
    actions: Parameters<typeof TaskContextMenuInner>[0]['actions'];
    recentAssignees: NonNullable<Parameters<typeof TaskContextMenuInner>[0]['recentAssignees']>;
    task: Parameters<typeof TaskContextMenuInner>[0]['task']
  }) {
  const { t } = vm
  return (
    <>{actions.onAssigneeChange && recentAssignees.length > 0 && (
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <span className="size-4 mr-2 flex-shrink-0 flex items-center justify-center">
            <span className="size-3 rounded-full bg-gradient-to-br from-blue-500 to-blue-600" />
          </span>
          {t("tasks.menu.assignTo")}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-[180px]">
          <ContextMenuItem
            onClick={() => actions.onAssigneeChange!(task.id, null)}
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
                {personName(a)}
              </ContextMenuItem>
            )
          })}
        </ContextMenuSubContent>
      </ContextMenuSub>
    )}</>
  )
}

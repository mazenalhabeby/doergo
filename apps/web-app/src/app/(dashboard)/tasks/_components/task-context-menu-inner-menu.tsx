"use client"

import { stepConfig } from "@/hooks/use-step-config"
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import { mayChangeStatus } from "@hbcfield/shared/client"
import type { TaskContextMenuInnerState } from "./use-task-context-menu-inner"
import type { TaskContextMenuInner } from "./task-context-menu"

/** Part of TaskContextMenuInner's markup, moved here unchanged; it reads the page's state from `vm`. */
export function TaskContextMenuInnerMenu(
  {
    vm,
    actions,
    task
  }: {
    vm: TaskContextMenuInnerState;
    actions: Parameters<typeof TaskContextMenuInner>[0]['actions'];
    task: Parameters<typeof TaskContextMenuInner>[0]['task']
  }) {
  const { flowStatuses, t, statusOptions, allowedTargets, isManager, currentIsFinished } = vm
  return (
    <>{actions.onStatusChange && (
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <span
            className="size-2 rounded-full mr-2 flex-shrink-0"
            style={{ backgroundColor: stepConfig(task.status, flowStatuses).hex }}
          />
          {t("tasks.menu.status")}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-[180px]">
          {/*
            The task's own statuses, not a fixed list — a task on a custom
            type was offered columns that do not exist in its flow. Entries
            the service would refuse are shown but not selectable, using the
            same rule it applies.
          */}
          {statusOptions.map((opt) => {
            const config = { hex: opt.hex, label: opt.label }
            const permitted = mayChangeStatus({
              from: task.status,
              to: opt.key,
              allowedTargets,
              targetIsValidStatus: true,
              isManager,
              fromIsFinished: currentIsFinished,
            })
            return (
              <ContextMenuItem
                key={opt.key}
                disabled={!permitted}
                onClick={() => actions.onStatusChange!(task.id, opt.key)}
                className={!permitted ? "opacity-50" : ""}
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
    )}</>
  )
}

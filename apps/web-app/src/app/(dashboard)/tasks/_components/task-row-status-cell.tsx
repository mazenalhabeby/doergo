"use client"

import { useTranslation } from "react-i18next"
import { ChevronDown } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { mayChangeStatus } from "@hbcfield/shared/client"
import type { Task } from "@/lib/api"
import type { TaskContextMenuActions } from "./task-context-menu-types"
import type { TaskRowStatus } from "./use-task-row-status"

/*
  Status — a control, not a label.

  Changing it here was possible all along, but only by right-clicking the
  row, which nobody discovers. On the board the same action is a drag you
  can see. This is the third way of doing one thing, so it opens the same
  list the context menu does. A finished task stays a plain badge: the
  server will not move it, so nothing here should suggest otherwise.
*/
export function TaskRowStatusCell({
  task,
  status,
  onStatusChange,
}: {
  task: Task
  status: TaskRowStatus
  onStatusChange: TaskContextMenuActions["onStatusChange"]
}) {
  const { t } = useTranslation()
  const { statusConfig, statusOptions, currentIsFinished, allowedTargets, isManager, canChangeStatus } = status
  return (
    <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
      {canChangeStatus ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={t("tasks.menu.status")}
              className={
                "-mx-2 inline-flex max-w-full items-center gap-2 rounded-full px-2 py-1 text-[13.5px] font-medium " +
                "text-foreground outline-none transition-colors hover:bg-shell-chip focus-visible:ring-2 " +
                "focus-visible:ring-ring"
              }
            >
              <span className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: statusConfig.hex }} />
              <span className="truncate">{statusConfig.label}</span>
              <ChevronDown className="size-3 shrink-0 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[180px]">
            {statusOptions.map((opt) => {
              // Shown, but only selectable when the move would be accepted —
              // the same rule the service applies.
              const permitted = mayChangeStatus({
                from: task.status,
                to: opt.key,
                allowedTargets,
                targetIsValidStatus: true,
                isManager,
                fromIsFinished: currentIsFinished,
              })
              return (
                <DropdownMenuItem
                  key={opt.key}
                  disabled={!permitted}
                  onClick={() => onStatusChange!(task.id, opt.key)}
                  className={!permitted ? "opacity-50" : ""}
                >
                  <span className="size-2 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: opt.hex }} />
                  {opt.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="inline-flex max-w-full items-center gap-2 text-[13.5px] font-medium text-muted-foreground">
          <span className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: statusConfig.hex }} />
          <span className="truncate">{statusConfig.label}</span>
        </span>
      )}
    </div>
  )
}

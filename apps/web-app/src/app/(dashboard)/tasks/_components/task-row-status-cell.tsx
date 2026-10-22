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
    <div className="w-[110px] flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      {canChangeStatus ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={t("tasks.menu.status")}
              className={
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] " +
                "font-semibold transition-opacity hover:opacity-80 focus:outline-none " +
                "focus-visible:ring-2 focus-visible:ring-ring"
              }
              style={{ backgroundColor: `${statusConfig.hex}14`, color: statusConfig.hex }}
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: statusConfig.hex }} />
              {statusConfig.label}
              <ChevronDown className="size-2.5 opacity-60" />
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
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ backgroundColor: `${statusConfig.hex}14`, color: statusConfig.hex }}
        >
          <span className="size-1.5 rounded-full" style={{ backgroundColor: statusConfig.hex }} />
          {statusConfig.label}
        </span>
      )}
    </div>
  )
}

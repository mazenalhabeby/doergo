"use client"

import { useTranslation } from "react-i18next"
import { flowIdOf, stepConfig } from "@/hooks/use-step-config"
import { useAuth } from "@/contexts/auth-context"
import { useWorkflow } from "@/hooks/use-org-workflow"
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import { isFinishedStatus, mayChangeStatus, STATUS_TRANSITIONS } from "@hbcfield/shared/client"
import { getStatusConfig, TASK_STATUSES } from "@/lib/constants"
import type { Task } from "@/lib/api"
import type { TaskContextMenuActions } from "./task-context-menu-types"

/** The context menu's Status submenu: the task's own flow's steps, the ones the service would refuse greyed out. */
export function TaskStatusSubmenu({
  task,
  onStatusChange,
}: {
  task: Task
  onStatusChange: TaskContextMenuActions["onStatusChange"]
}) {
  const { t } = useTranslation()
  const { user, hasPermission } = useAuth()

  /*
    The statuses THIS task can be in — its own type's, not a fixed list. Same
    derivation as the table row; both feed the shared rule so what is offered
    matches what the service accepts.
  */
  const { statuses: flowStatuses, hasWorkflow: taskHasWorkflow } = useWorkflow(flowIdOf(task))
  const usesFlow = taskHasWorkflow && flowStatuses.length > 0
  const statusOptions = usesFlow
    ? flowStatuses.map((st) => ({ key: st.key, label: st.name, hex: st.color }))
    : TASK_STATUSES.filter((st) => st !== "DRAFT").map((st) => {
        const cfg = getStatusConfig(st)
        return { key: st, label: cfg.label, hex: cfg.hex }
      })
  const currentFlowStatus = usesFlow ? flowStatuses.find((st) => st.key === task.status) : undefined
  const currentIsFinished = usesFlow
    ? !!currentFlowStatus?.isFinal || !!currentFlowStatus?.isCanceled
    : isFinishedStatus(task.status)
  const allowedTargets: string[] = usesFlow
    ? (currentFlowStatus?.transitions ?? [])
    : ((STATUS_TRANSITIONS[task.status as keyof typeof STATUS_TRANSITIONS] ?? []) as string[])
  const isManager = user?.role === "ADMIN" || hasPermission("canViewAllTasks")

  return (
    <>
      {onStatusChange && (
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
                  onClick={() => onStatusChange(task.id, opt.key)}
                  className={!permitted ? "opacity-50" : ""}
                >
                  <span className="size-2 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: config.hex }} />
                  {config.label}
                </ContextMenuItem>
              )
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}
    </>
  )
}

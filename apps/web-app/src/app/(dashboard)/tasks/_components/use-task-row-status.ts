"use client"

import { flowIdOf, stepConfig, useStepLabel } from "@/hooks/use-step-config"
import { isFinishedStatus, hasAnyTransition, STATUS_TRANSITIONS } from "@hbcfield/shared/client"
import { useWorkflow } from "@/hooks/use-org-workflow"
import { useAuth } from "@/contexts/auth-context"
import { getStatusConfig, TASK_STATUSES } from "@/lib/constants"
import type { Task } from "@/lib/api"
import type { TaskContextMenuActions } from "./task-context-menu-types"

/** A table row's step: how it is drawn, the steps it may move to, and whether moving it is offered at all. */
export function useTaskRowStatus(task: Task, onStatusChange: TaskContextMenuActions["onStatusChange"]) {
  const { user, hasPermission } = useAuth()

  /*
    The statuses THIS task can be in — its own task type's, not a fixed list.

    The dropdown listed the canonical statuses regardless of the task's type, so
    a task on a custom flow was offered columns that do not exist in it. It
    reads the task's workflow now, falling back to the canonical machine only
    when the task has none.
  */
  // The task's own flow, else its workspace's — a task with no type of its own inherits it.
  const { statuses: flowStatuses, hasWorkflow: taskHasWorkflow } = useWorkflow(flowIdOf(task))
  const { translate: stepTranslate, label: stepLabel } = useStepLabel()
  const statusConfig = stepConfig(task.status, flowStatuses, stepTranslate)
  const statusOptions =
    taskHasWorkflow && flowStatuses.length
      ? flowStatuses.map((st) => ({ key: st.key, label: stepLabel(st), hex: st.color }))
      : TASK_STATUSES.filter((st) => st !== "DRAFT").map((st) => {
          const cfg = getStatusConfig(st)
          return { key: st, label: cfg.label, hex: cfg.hex }
        })

  const currentIsFinished =
    taskHasWorkflow && flowStatuses.length
      ? (() => {
          const cur = flowStatuses.find((st) => st.key === task.status)
          return !!cur?.isFinal || !!cur?.isCanceled
        })()
      : isFinishedStatus(task.status)

  const allowedTargets: string[] =
    taskHasWorkflow && flowStatuses.length
      ? (flowStatuses.find((st) => st.key === task.status)?.transitions ?? [])
      : ((STATUS_TRANSITIONS[task.status as keyof typeof STATUS_TRANSITIONS] ?? []) as string[])

  const isManager = user?.role === "ADMIN" || hasPermission("canViewAllTasks")

  // Offered only when there is something to offer: an action to call, and a
  // task the server would actually move.
  const canChangeStatus =
    !!onStatusChange &&
    hasAnyTransition({
      allowedTargets,
      isManager,
      fromIsFinished: currentIsFinished,
    })

  return { statusConfig, statusOptions, currentIsFinished, allowedTargets, isManager, canChangeStatus }
}

export type TaskRowStatus = ReturnType<typeof useTaskRowStatus>

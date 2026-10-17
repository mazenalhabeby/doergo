"use client"

import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { mayChangeStatus, isFinishedStatus, STATUS_TRANSITIONS, type StepFormAnswers } from "@hbcfield/shared/client"

import { keys, invalidateTaskLists } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { useAuth } from "@/contexts/auth-context"
import { useClockGate, useOfficeStart } from "@/hooks"
import type { useOrgWorkflow } from "@/hooks/use-org-workflow"
import { tasksApi, type Task, type OnBehalf } from "@/lib/api"
import { useStepMove } from "@/components/step-forms/use-step-move"
import { isStepFormRefusal } from "@/lib/step-forms"
import { serverErrorMessage } from "@/lib/server-error"
import { snapshotTasksCache, optimisticUpdateTask, restoreTasksCache } from "../_lib/task-list"

/**
 * Every status change on the task page — a kanban drop, a context menu — goes
 * through here: the step's form when it has one, the clock gate when the
 * worker is off the clock, the office-start explanation, and an optimistic
 * move rolled back on refusal.
 */
export function useTaskStatusChange({
  tasks,
  orgWorkflows,
  contextDefaultWorkflowId,
}: {
  tasks: Task[]
  orgWorkflows: ReturnType<typeof useOrgWorkflow>["workflows"]
  contextDefaultWorkflowId: string | null
}) {
  const { user, hasPermission } = useAuth()
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  /*
    "Ask when a job moves here". A move into a step with a form opens the
    step's dialog and goes out only with its answers. The list carries no
    effective workflow per task, so it is the task's own type, else this
    view's default — and when that guess is wrong the server's refusal makes
    `useStepMove` read the job's real one and ask anyway.
  */
  const stepMove = useStepMove()
  const workflowForTask = useCallback(
    (task: Task) => {
      const wfId = task.workflowId ?? contextDefaultWorkflowId
      return orgWorkflows.find((w) => w.id === wfId) ?? null
    },
    [orgWorkflows, contextDefaultWorkflowId],
  )

  const clockGate = useClockGate()
  const officeStart = useOfficeStart()

  // Kanban drag-and-drop status change
  const statusChangeMutation = useMutation({
    mutationFn: (
      { taskId, status, answers, onBehalf }: { taskId: string; status: string; answers?: StepFormAnswers; onBehalf?: OnBehalf }) =>
      tasksApi.updateStatus(taskId, status, undefined, answers, onBehalf),
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: keys.tasks.lists() })
      const snapshot = snapshotTasksCache(queryClient)
      optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, status }))
      return { snapshot }
    },
    onError: (e: Error, vars, context) => {
      if (context?.snapshot) restoreTasksCache(queryClient, context.snapshot)
      // Off the clock: offer to clock in, then the same move again by itself.
      if (clockGate.intercept(e, () => statusChangeMutation.mutate(vars))) return
      // The office starting somebody's job: say why, then the same move again.
      if (officeStart.intercept(e, (onBehalf) => statusChangeMutation.mutate({ ...vars, onBehalf }))) return
      // A step-form refusal is answered by the step's dialog, not a toast.
      if (!isStepFormRefusal(e)) notify.error(serverErrorMessage(e, t))
    },
    onSettled: () => {
      invalidateTaskLists(queryClient)
    },
  })

  /** Every status change on this page: through the step's form when it has one. */
  const requestStatusChange = useCallback(
    (taskId: string, status: string) => {
      const task = tasks.find((tk) => tk.id === taskId)
      if (!task) {
        statusChangeMutation.mutate({ taskId, status })
        return
      }
      stepMove
        .move({
          task,
          status,
          workflow: workflowForTask(task),
          send: (answers) => statusChangeMutation.mutateAsync({ taskId, status, answers }),
        })
        .catch((e: unknown) => {
          // Anything else was already said by the mutation's own onError.
          if (isStepFormRefusal(e)) notify.error(serverErrorMessage(e, t))
        })
    },
    [tasks, statusChangeMutation, stepMove, workflowForTask, t],
  )

  const handleKanbanDrop = useCallback((taskId: string, newStatus: string) => {
    const task = tasks.find(t => t.id === taskId)
    // Don't do anything if dropping on the same status
    if (task && task.status === newStatus) return

    /*
      Refuse a move the server would refuse, here rather than after a round
      trip. A card lifts only when it can move at all, but WHERE it may land is
      a second question: a completed task may be closed and nothing else, so
      dropping it in "In Progress" should not travel and come back as an error.
      Same rule the service applies.
    */
    if (task && !mayChangeStatus({
      from: task.status,
      to: newStatus,
      allowedTargets: (STATUS_TRANSITIONS[task.status as keyof typeof STATUS_TRANSITIONS] ?? []) as string[],
      targetIsValidStatus: true,
      isManager: user?.role === "ADMIN" || hasPermission('canViewAllTasks'),
      fromIsFinished: isFinishedStatus(task.status),
    })) {
      notify.error(t("tasks.notify.invalidTransition", {
        defaultValue: "This task can no longer be moved there.",
      }))
      return
    }

    requestStatusChange(taskId, newStatus)
  }, [tasks, requestStatusChange, user, t])

  return { stepMove, workflowForTask, clockGate, officeStart, requestStatusChange, handleKanbanDrop }
}

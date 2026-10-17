"use client"

import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"

import { keys, invalidateTaskLists } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { useAuth } from "@/contexts/auth-context"
import { tasksApi, type Task } from "@/lib/api"
import { runBulk } from "@/lib/concurrency"
import { stepFormForMove } from "@/lib/step-forms"
import { isAssignedTo } from "@/lib/task-assignment"
import type { useTaskStatusChange } from "./use-task-status-change"

/** The bulk bar's and the backlog toolbar's actions over the selected tasks. */
export function useTaskBulkActions({
  tasks,
  workflowForTask,
  handleClearSelection,
}: {
  tasks: Task[]
  workflowForTask: ReturnType<typeof useTaskStatusChange>["workflowForTask"]
  handleClearSelection: () => void
}) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Bulk action handlers
  const handleBulkStatusChange = useCallback((taskIds: string[], status: string) => {
    /*
      A step that asks something is answered job by job — one form cannot be
      one set of answers for twenty different jobs. Those are left where they
      are and named; the rest move as before.
    */
    const asks = new Set(
      taskIds.filter((id) => {
        const task = tasks.find((tk) => tk.id === id)
        return !!task && !!stepFormForMove({ workflow: workflowForTask(task), statusKey: status, isAssignee: isAssignedTo(task, user?.id) })
      }),
    )
    const movable = taskIds.filter((id) => !asks.has(id))
    if (asks.size > 0) {
      notify.error(t("stepForm.bulkSkipped", {
        count: asks.size,
        defaultValue: "{{count}} jobs were not moved: that step asks for answers. Move them one at a time.",
      }))
    }
    if (movable.length === 0) {
      handleClearSelection()
      return
    }
    runBulk(movable, (id) => tasksApi.updateStatus(id, status))
      .then(({ failed }) => {
        if (failed > 0) notify.error(t("tasks.notify.updatesFailed", { failed, total: movable.length }))
        else notify.bulk(movable.length, t("tasks.notify.actionUpdated"))
        handleClearSelection()
        invalidateTaskLists(queryClient)
      })
  }, [handleClearSelection, queryClient, tasks, workflowForTask, user?.id, t])

  const handleBulkPriorityChange = useCallback((taskIds: string[], priority: string) => {
    runBulk(taskIds, (id) => tasksApi.update(id, { priority }))
      .then(({ failed }) => {
        if (failed > 0) notify.error(t("tasks.notify.updatesFailed", { failed, total: taskIds.length }))
        else notify.bulk(taskIds.length, t("tasks.notify.actionUpdated"))
        handleClearSelection()
        queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
      })
  }, [handleClearSelection, queryClient])

  const handleBulkSprintChange = useCallback((taskIds: string[], sprintId: string | null) => {
    runBulk(taskIds, (id) => tasksApi.update(id, { sprintId }))
      .then(({ failed }) => {
        if (failed > 0) notify.error(t("tasks.notify.updatesFailed", { failed, total: taskIds.length }))
        else notify.bulk(taskIds.length, t("tasks.notify.actionMoved"))
        handleClearSelection()
        queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
        queryClient.invalidateQueries({ queryKey: keys.sprints.lists() })
      })
  }, [handleClearSelection, queryClient])

  const handleBulkDelete = useCallback((taskIds: string[]) => {
    runBulk(taskIds, (id) => tasksApi.delete(id))
      .then(({ failed }) => {
        if (failed > 0) notify.error(t("tasks.notify.deletesFailed", { failed, total: taskIds.length }))
        else notify.bulk(taskIds.length, t("tasks.notify.actionDeleted"))
        handleClearSelection()
        invalidateTaskLists(queryClient)
      })
  }, [handleClearSelection, queryClient])

  const handleBulkEstimate = useCallback((taskIds: string[], points: number) => {
    runBulk(taskIds, (id) => tasksApi.update(id, { storyPoints: points }))
      .then(({ failed }) => {
        if (failed > 0) notify.error(t("tasks.notify.updatesFailed", { failed, total: taskIds.length }))
        else notify.bulk(taskIds.length, t("tasks.notify.actionEstimated"))
        handleClearSelection()
        queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
      })
  }, [handleClearSelection, queryClient])

  const handleBulkSpaceChange = useCallback((taskIds: string[], spaceId: string | null) => {
    runBulk(taskIds, (id) => tasksApi.update(id, { spaceId }))
      .then(({ failed }) => {
        if (failed > 0) notify.error(t("tasks.notify.updatesFailed", { failed, total: taskIds.length }))
        else notify.bulk(taskIds.length, t("tasks.notify.actionMoved"))
        handleClearSelection()
        queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
      })
  }, [handleClearSelection, queryClient])

  return {
    handleBulkStatusChange,
    handleBulkPriorityChange,
    handleBulkSprintChange,
    handleBulkDelete,
    handleBulkEstimate,
    handleBulkSpaceChange,
  }
}

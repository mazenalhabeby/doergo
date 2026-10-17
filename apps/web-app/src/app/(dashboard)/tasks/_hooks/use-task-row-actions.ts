"use client"

import { useMemo, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"

import { keys, invalidateTaskLists } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { tasksApi, type Task, type TasksListResponse } from "@/lib/api"
import type { TaskContextMenuActions } from "../_components/task-context-menu"
import { snapshotTasksCache, optimisticUpdateTask, restoreTasksCache } from "../_lib/task-list"

/**
 * One-task edits from the views — drag to reorder, drag between groups, the
 * right-click menu — each applied optimistically and rolled back on refusal.
 */
export function useTaskRowActions({
  tasks,
  requestStatusChange,
}: {
  tasks: Task[]
  requestStatusChange: (taskId: string, status: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Handle reorder within same column/group
  const handleReorder = useCallback((taskId: string, newPosition: number, _groupKey: string) => {
    // Real API: optimistic position update
    const snapshot = snapshotTasksCache(queryClient)
    optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, position: newPosition }))
    tasksApi.update(taskId, { position: newPosition }).then(() => {
      queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
    }).catch((e: Error) => {
      restoreTasksCache(queryClient, snapshot)
      notify.error(e.message)
    })
  }, [queryClient])

  // Handle cross-group change (drag between groups in grouped list)
  const handleGroupChange = useCallback((taskId: string, updates: Record<string, string | null>) => {
    // Optimistic update for cross-group drag
    const snapshot = snapshotTasksCache(queryClient)
    optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, ...updates }))
    const field = Object.keys(updates)[0] || "field"
    tasksApi.update(taskId, updates).then(() => {
      notify.success(t("tasks.notify.taskFieldUpdated", { field: field.replace("Id", "") }))
      queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: keys.sprints.lists() })
    }).catch((e: Error) => {
      restoreTasksCache(queryClient, snapshot)
      notify.error(e.message)
    })
  }, [queryClient])

  // Context menu actions
  const contextActions: TaskContextMenuActions = useMemo(() => ({
    onStatusChange: (taskId: string, status: string) => {
      requestStatusChange(taskId, status)
    },
    onPriorityChange: (taskId: string, priority: string) => {
      const snapshot = snapshotTasksCache(queryClient)
      optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, priority }))
      tasksApi.update(taskId, { priority }).then(() => {
        notify.success(t("tasks.notify.priorityUpdated"))
        queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
      }).catch((e: Error) => {
        restoreTasksCache(queryClient, snapshot)
        notify.error(e.message)
      })
    },
    onSprintChange: (taskId: string, sprintId: string | null) => {
      const snapshot = snapshotTasksCache(queryClient)
      optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, sprintId }))
      tasksApi.update(taskId, { sprintId }).then(() => {
        notify.success(sprintId ? t("tasks.notify.movedToSprint") : t("tasks.notify.movedToBacklog"))
        queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
        queryClient.invalidateQueries({ queryKey: keys.sprints.lists() })
      }).catch((e: Error) => {
        restoreTasksCache(queryClient, snapshot)
        notify.error(e.message)
      })
    },
    onPhaseChange: (taskId: string, phaseId: string | null) => {
      const snapshot = snapshotTasksCache(queryClient)
      optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, phaseId }))
      tasksApi.update(taskId, { phaseId }).then(() => {
        notify.success(phaseId ? t("tasks.notify.phaseSet") : t("tasks.notify.phaseRemoved"))
        queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
      }).catch((e: Error) => {
        restoreTasksCache(queryClient, snapshot)
        notify.error(e.message)
      })
    },
    onEpicChange: (taskId: string, epicId: string | null) => {
      const snapshot = snapshotTasksCache(queryClient)
      optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, epicId }))
      tasksApi.update(taskId, { epicId }).then(() => {
        notify.success(epicId ? t("tasks.notify.epicSet") : t("tasks.notify.epicRemoved"))
        queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
      }).catch((e: Error) => {
        restoreTasksCache(queryClient, snapshot)
        notify.error(e.message)
      })
    },
    onStoryPointsChange: (taskId: string, points: number | null) => {
      const snapshot = snapshotTasksCache(queryClient)
      optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, storyPoints: points }))
      tasksApi.update(taskId, { storyPoints: points }).then(() => {
        notify.success(points ? t("tasks.notify.pointsSet", { points }) : t("tasks.notify.pointsCleared"))
        queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
      }).catch((e: Error) => {
        restoreTasksCache(queryClient, snapshot)
        notify.error(e.message)
      })
    },
    onSpaceChange: (taskId: string, spaceId: string | null) => {
      const snapshot = snapshotTasksCache(queryClient)
      optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, spaceId }))
      tasksApi.update(taskId, { spaceId }).then(() => {
        notify.success(spaceId ? t("tasks.notify.movedToSpace") : t("tasks.notify.spaceRemoved"))
        queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
      }).catch((e: Error) => {
        restoreTasksCache(queryClient, snapshot)
        notify.error(e.message)
      })
    },
    onDelete: (taskId: string) => {
      const snapshot = snapshotTasksCache(queryClient)
      // Optimistically remove task from cache
      queryClient.setQueriesData<TasksListResponse>(
        { queryKey: keys.tasks.lists() },
        (old) => {
          if (!old?.data) return old
          return {
            ...old,
            data: old.data.filter((t) => t.id !== taskId),
            meta: old.meta ? { ...old.meta, total: old.meta.total - 1 } : old.meta,
          }
        })
        tasksApi
          .delete(taskId)
          .then(() => {
            notify.success(t("tasks.notify.taskDeleted"))
            invalidateTaskLists(queryClient)
          })
          .catch((e: Error) => {
            restoreTasksCache(queryClient, snapshot)
            notify.error(e.message)
          })
      },
    }),
    [requestStatusChange, queryClient],
  )

  // Build recent assignees from visible tasks for context menu
  const recentAssignees = useMemo(() => {
    const map = new Map<string, { id: string; firstName: string; lastName: string }>()
    for (const task of tasks) {
      if (task.assignedTo) {
        map.set(task.assignedTo.id, {
          id: task.assignedTo.id,
          firstName: task.assignedTo.firstName ?? "",
          lastName: task.assignedTo.lastName ?? "",
        })
      }
      if (task.assignees) {
        for (const a of task.assignees) {
          map.set(a.user.id, {
            id: a.user.id,
            firstName: a.user.firstName ?? "",
            lastName: a.user.lastName ?? "",
          })
        }
      }
    }
    return Array.from(map.values()).slice(0, 8)
  }, [tasks])

  return { handleReorder, handleGroupChange, contextActions, recentAssignees }
}

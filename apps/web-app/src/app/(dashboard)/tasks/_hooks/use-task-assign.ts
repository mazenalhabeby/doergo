"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

import { keys, invalidateTaskLists } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { tasksApi } from "@/lib/api"
import { useHandoverPendingText } from "@/components/tasks/handover-pending-notice"
import { snapshotTasksCache, optimisticUpdateTask, restoreTasksCache } from "../_lib/task-list"

/**
 * Assigning somebody from the list: which task the dialog is open for, the
 * handover note when a handover is still owed, the single-assign mutation and
 * the multi-assignee save — all optimistic.
 */
export function useTaskAssign() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Assign dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  /*
    Reassigning a job whose handover is still owed (shared tasks/handover.ts):
    the list row carries no names, so the job itself is read — only while the
    dialog is open, under the key the task page caches it by.
  */
  const { data: assignDetail } = useQuery({
    queryKey: keys.tasks.detail(selectedTaskId),
    queryFn: () => tasksApi.getById(selectedTaskId!),
    enabled: assignDialogOpen && !!selectedTaskId,
    staleTime: 30_000,
  })
  const handoverPending = useHandoverPendingText(assignDetail)
  const [reassignNote, setReassignNote] = useState("")

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: async (workerId: string) => {
      if (!selectedTaskId) throw new Error(t("tasks.notify.noTaskSelected"))
      const done = await tasksApi.assign(selectedTaskId, workerId)
      // A note for whoever takes the job over, posted on the job.
      if (reassignNote.trim()) await tasksApi.addComment(selectedTaskId, reassignNote.trim())
      return done
    },
    onMutate: async (workerId) => {
      if (!selectedTaskId) return
      await queryClient.cancelQueries({ queryKey: keys.tasks.lists() })
      const snapshot = snapshotTasksCache(queryClient)
      optimisticUpdateTask(queryClient, selectedTaskId, (t) => ({
        ...t,
        assignedToId: workerId,
        status: t.status === "NEW" ? "ASSIGNED" : t.status,
      }))
      return { snapshot }
    },
    onError: (e: Error, _vars, context) => {
      if (context?.snapshot) restoreTasksCache(queryClient, context.snapshot)
      notify.error(e.message)
    },
    onSuccess: () => {
      setReassignNote("")
      notify.success(t("tasks.notify.memberAssigned"))
    },
    onSettled: () => {
      // Always refetch to sync with server
      invalidateTaskLists(queryClient)
    },
  })

  const handleAssignClick = (taskId: string) => {
    setSelectedTaskId(taskId)
    setAssignDialogOpen(true)
  }

  /** The multi-assignee dialog's save: remove first, then add. */
  const saveAssignees = async (added: string[], removed: string[]) => {
    if (!selectedTaskId) return
    // Optimistic update, then batch: remove first, then add
    await queryClient.cancelQueries({ queryKey: keys.tasks.lists() })
    const snapshot = snapshotTasksCache(queryClient)
    optimisticUpdateTask(queryClient, selectedTaskId, (t) => {
      let assignees = [...(t.assignees || [])]
      assignees = assignees.filter((a) => !removed.includes(a.userId))
      for (const memberId of added) {
        if (!assignees.find((a) => a.userId === memberId)) {
          // Optimistic placeholder: the real row arrives on refetch.
          assignees.push({
            id: `temp-${memberId}`,
            userId: memberId,
            role: assignees.length === 0 ? ("LEAD" as const) : ("MEMBER" as const),
            user: { id: memberId, firstName: "", lastName: "" },
            createdAt: new Date().toISOString(),
          })
        }
      }
      return { ...t, assignees }
    })
    const ops: Promise<unknown>[] = [
      ...removed.map(id => tasksApi.removeAssignee(selectedTaskId, id)),
      ...added.map(id => tasksApi.addAssignee(selectedTaskId, id)),
    ]
    const results = await Promise.allSettled(ops)
    // The note for whoever takes the job over (handover still owed) — posted on the job.
    if (added.length && reassignNote.trim()) {
      await tasksApi.addComment(selectedTaskId, reassignNote.trim()).catch(() => undefined)
      setReassignNote("")
    }
    const failed = results.filter(r => r.status === "rejected").length
    if (failed > 0) {
      restoreTasksCache(queryClient, snapshot)
      notify.error(t("tasks.notify.assigneeUpdatesFailed", { failed }))
    } else {
      notify.success(t("tasks.detail.assigneesUpdated"))
    }
    queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
  }

  return {
    assignDialogOpen, setAssignDialogOpen,
    selectedTaskId, setSelectedTaskId,
    handoverPending, reassignNote, setReassignNote,
    assignMutation, handleAssignClick, saveAssignees,
  }
}

export type TaskAssign = ReturnType<typeof useTaskAssign>

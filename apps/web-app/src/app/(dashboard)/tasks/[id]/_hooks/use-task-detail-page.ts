"use client"

import { keys, invalidateTask } from "@/lib/query-keys"
import { useClockGate, useOfficeStart } from "@/hooks"
import { useState, useCallback } from "react"
import { useMutation } from "@tanstack/react-query"
import { tasksApi, type OnBehalf } from "@/lib/api"
import { notify } from "@/lib/toast"
import { serverErrorMessage } from "@/lib/server-error"
import { useHandoverPendingText } from "@/components/tasks/handover-pending-notice"
import { useLatched } from "@/hooks/use-latched"
import { useTaskDetailPageData } from "./use-task-detail-page-data"

/** TaskDetailPage's state and handlers — everything before its markup, moved here unchanged. */
export function useTaskDetailPage({
  params,
}: Pick<
  {
    params: Promise<{ id: string }>
  },
  "params"
>) {
  const taskDetailPageData = useTaskDetailPageData({ params })
  const { id, t, queryClient, showAssignModal, showEditDialog, task, moveWorkflow, stepMove } = taskDetailPageData

  const deleteMutation = useMutation({
    mutationFn: () =>
      stepMove.move({
        task: task!,
        status: "CANCELED",
        workflow: moveWorkflow,
        send: (answers) => tasksApi.updateStatus(id, "CANCELED", undefined, answers),
      }),
    onSuccess: (result) => {
      if (result === "cancelled") return
      queryClient.invalidateQueries({ queryKey: keys.tasks.submissions(id) })
      notify.success(t("tasks.detail.requestCancelled"))
      // The list's space tabs are server-counted; a status change or a move
      // between spaces makes those numbers stale.
      invalidateTask(queryClient, id, { counts: true })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const statusChangeMutation = useMutation({
    mutationFn: ({ status: newStatus, onBehalf }: { status: string; onBehalf?: OnBehalf }) =>
      stepMove.move({
        task: task!,
        status: newStatus,
        workflow: moveWorkflow,
        send: (answers) => tasksApi.updateStatus(id, newStatus, undefined, answers, onBehalf),
      }),
    onSuccess: (result) => {
      // The step's dialog was closed without answering — nothing moved.
      if (result === "cancelled") return
      queryClient.invalidateQueries({ queryKey: keys.tasks.submissions(id) })
      queryClient.invalidateQueries({ queryKey: keys.tasks.time(id) })
      notify.success(t("tasks.detail.statusUpdated"))
      // The list's space tabs are server-counted; a status change or a move
      // between spaces makes those numbers stale.
      invalidateTask(queryClient, id, { counts: true })
    },
    // Off the clock: offer to clock in, then the same move again by itself.
    onError: (e: Error, vars) => {
      if (clockGate.intercept(e, () => statusChangeMutation.mutate(vars))) return
      // The office starting somebody's job: say why, then the same move again.
      if (officeStart.intercept(e, (onBehalf) => statusChangeMutation.mutate({ ...vars, onBehalf }))) return
      notify.error(serverErrorMessage(e, t))
    },
  })
  const clockGate = useClockGate()
  const officeStart = useOfficeStart()

  /*
    Paused at a clock-out (shared tasks/handover.ts). Resume is a move into work:
    off the clock, the same "clock in first" dialog answers and repeats it.
  */
  const refreshTask = () => {
    invalidateTask(queryClient, id, { time: true, timeline: true })
  }
  const resumeMutation = useMutation({
    mutationFn: () => tasksApi.resumeWork(id),
    onSuccess: () => {
      notify.success(t("tasks.handover.resumed"))
      refreshTask()
    },
    onError: (e: Error) => {
      if (clockGate.intercept(e, () => resumeMutation.mutate())) return
      notify.error(serverErrorMessage(e, t))
    },
  })
  // "Mike hasn't written a handover yet" — the job's card and the reassign dialog say the same.
  const handoverPending = useHandoverPendingText(task)
  const writeHandover = async (note: string) => {
    try {
      await tasksApi.writeHandover(id, note)
      notify.success(t("tasks.handover.saved"))
      refreshTask()
    } catch (e) {
      notify.error(serverErrorMessage(e as Error, t))
      throw e
    }
  }

  /*
    Inline field save — title, description, hours, points.

    This refreshed only THIS task, so an edit made here was invisible on the
    list and the board until a hard reload: same data, two caches, one of them
    told. It also swallowed nothing — the update was awaited with no catch, so a
    rejection surfaced as an unhandled promise rather than as a message.

    Every cache holding this task now hears about it, and a failure says so.
  */
  const handleFieldSave = useCallback(
    async (field: string, value: string) => {
      const parsed = value === "" ? null : field === "estimatedHours" || field === "storyPoints" ? Number(value) : value
      try {
        await tasksApi.update(id, { [field]: parsed })
      } catch (e) {
        notify.error(e instanceof Error && e.message ? e.message : t("tasks.detail.updateFailed"))
        throw e // let the field restore what was there before
      }
      invalidateTask(queryClient, id, { counts: true, timeline: true })
    },
    [id, queryClient, t],
  )

  // Comments
  const [newComment, setNewComment] = useState("")
  const commentMutation = useMutation({
    mutationFn: (content: string) => tasksApi.addComment(id, content),
    onSuccess: () => {
      notify.success(t("tasks.detail.commentAdded"))
      setNewComment("")
      queryClient.invalidateQueries({ queryKey: keys.tasks.detail(id), refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: keys.tasks.timeline(id), refetchType: "all" })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  // A lazily loaded dialog mounts the first time it opens and stays (its close animates).
  const editMounted = useLatched(showEditDialog)
  const assignMounted = useLatched(showAssignModal)
  const clockGateMounted = useLatched(clockGate.dialogProps.open)
  const officeStartMounted = useLatched(officeStart.dialogProps.open)

  return {
    ...taskDetailPageData,
    deleteMutation,
    statusChangeMutation,
    clockGate,
    officeStart,
    resumeMutation,
    handoverPending,
    writeHandover,
    handleFieldSave,
    newComment,
    setNewComment,
    commentMutation,
    editMounted,
    assignMounted,
    clockGateMounted,
    officeStartMounted,
  }
}

/** What TaskDetailPage and its sections read. */
export type TaskDetailPageState = ReturnType<typeof useTaskDetailPage>

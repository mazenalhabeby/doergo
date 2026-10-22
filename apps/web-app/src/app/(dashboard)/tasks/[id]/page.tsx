"use client"

import { keys } from "@/lib/query-keys"

import { RefreshCw, AlertCircle } from "lucide-react"

import { TaskDetailPageSkeleton } from "@/components/skeletons/page-skeletons"
import { tasksApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { notify } from "@/lib/toast"

// Each from its own file, not the `./_components` barrel: app code is assumed to
// have side effects, so importing one name through the barrel kept EVERY section
// (the lazily loaded ones below included) in the page bundle.
import { HandoverPendingNotice } from "@/components/tasks/handover-pending-notice"
import { useTaskDetailPage } from "./_hooks/use-task-detail-page"
import { EditTaskDialog, AssignMemberDialog, ClockGateDialog, OfficeStartDialog } from "./_components/task-detail-page-helpers"
import { TaskDetailPageView } from "./_components/task-detail-page-view"
import { TaskDetailPageSections } from "./_components/task-detail-page-sections"

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const vm = useTaskDetailPage({ params })
  const {
    id,
    t,
    queryClient,
    user,
    canAddWork,
    showAssignModal,
    setShowAssignModal,
    activityCount,
    setActivityCount,
    showEditDialog,
    setShowEditDialog,
    task,
    isLoading,
    isError,
    error,
    refetch,
    hasModule,
    mayReadRoute,
    routeData,
    loadingRoute,
    sprints,
    phases,
    epicsData,
    workflowStatuses,
    hasWorkflow,
    moveWorkflow,
    stepMove,
    isCanceled,
    isCompleted,
    hasAssignee,
    canEdit,
    canAssign,
    canCancel,
    allowedTransitions,
    reassignNote,
    setReassignNote,
    assignMutation,
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
  } = vm

  // ─── Loading ────────────────────────────────────────────────────────────
  // The same skeleton the route loader shows, so the shape never changes
  // between the two waits.
  if (isLoading) {
    return <TaskDetailPageSkeleton />
  }

  // ─── Error ──────────────────────────────────────────────────────────────
  if (isError || !task) {
    return (
      <div className="min-h-full bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-card rounded-2xl shadow-sm p-12 text-center">
            <AlertCircle className="mx-auto size-12 text-red-400 mb-4" />
            <p className="font-semibold text-lg mb-2">{t("tasks.detail.failedToLoad")}</p>
            <p className="text-muted-foreground mb-4">{(error as Error)?.message || t("tasks.detail.notFound")}</p>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="mr-2 size-4" /> {t("common.retry")}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const {
    comments,
    checklistDone,
    checklistTotal,
    depCount,
    subtaskCount,
    attachmentCount,
    openIfPresent,
    onTheJob,
  } = TaskDetailPageView({ id, user, task, isCompleted })

  return (
    <div className="min-h-full bg-background">
      {/* Dialogs */}
      {assignMounted && <AssignMemberDialog
        open={showAssignModal}
        onOpenChange={setShowAssignModal}
        taskId={id}
        spaceId={task?.spaceId}
        currentAssigneeId={task?.assignedToId}
        currentAssigneeIds={task?.assignees?.map((a) => a.userId) || []}
        isAssigning={assignMutation.isPending}
        notice={handoverPending
          ? <HandoverPendingNotice
            text={handoverPending}
            onWait={() => setShowAssignModal(false)}
            note={reassignNote}
            onNoteChange={setReassignNote}
          />
          : null}
        onAssign={(memberId) => assignMutation.mutate(memberId)}
        onSave={async (added, removed) => {
          const ops: Promise<unknown>[] = [
            ...removed.map(uid => tasksApi.removeAssignee(id, uid)),
            ...added.map(uid => tasksApi.addAssignee(id, uid)),
          ]
          await Promise.allSettled(ops)
          // The note for whoever takes the job over — posted here too, not only on a single reassign.
          if (added.length && reassignNote.trim()) {
            await tasksApi.addComment(id, reassignNote.trim()).catch(() => undefined)
            setReassignNote("")
          }
          notify.success(t("tasks.detail.assigneesUpdated"))
          queryClient.invalidateQueries({ queryKey: keys.tasks.detail(id), refetchType: "all" })
        }}
      />}
      {editMounted && <EditTaskDialog task={task} open={showEditDialog} onOpenChange={setShowEditDialog} />}
      {clockGateMounted && <ClockGateDialog {...clockGate.dialogProps} />}
      {officeStartMounted && <OfficeStartDialog {...officeStart.dialogProps} />}
      {stepMove.dialog}

      <TaskDetailPageSections
        vm={vm}
        onTheJob={onTheJob}
        subtaskCount={subtaskCount}
        openIfPresent={openIfPresent}
        checklistTotal={checklistTotal}
        checklistDone={checklistDone}
        attachmentCount={attachmentCount}
        depCount={depCount}
        comments={comments}
      />
    </div>
  )
}

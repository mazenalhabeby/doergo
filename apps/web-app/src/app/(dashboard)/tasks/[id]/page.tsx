"use client"

import { use, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { keys } from "@/lib/query-keys"
import { assigneeIds } from "@/lib/task-assignment"

import { RefreshCw, AlertCircle } from "lucide-react"

import { TaskDetailPageSkeleton } from "@/components/skeletons/task-detail-skeleton"
import { tasksApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { notify } from "@/lib/toast"

// Each from its own file, not the `./_components` barrel: app code is assumed to
// have side effects, so importing one name through the barrel kept EVERY section
// (the lazily loaded ones below included) in the page bundle.
import { useTaskDetail } from "./_hooks/use-task-detail"
import { useTaskDetailActions } from "./_hooks/use-task-detail-actions"
import { TaskDetailDialogs } from "./_components/task-detail-dialogs"
import { TaskProgressCard } from "./_components/task-progress-card"
import { TaskDetailHeader } from "./_components/task-detail-header"
import { TaskDetailSidebar } from "./_components/task-detail-sidebar"
import { HandoverCard } from "./_components/handover-card"
import { JobTimeCard } from "./_components/job-time-card"
import { TaskCrewCard } from "./_components/task-crew-card"
import { OpenRoleCard } from "./_components/open-role-card"
import { TaskDetailMainColumn } from "./_components/task-detail-main-column"

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const {
    user,
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
  } = useTaskDetail(id)
  const {
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
  } = useTaskDetailActions({ id, task, moveWorkflow, stepMove, setShowAssignModal })

  // ─── Loading ────────────────────────────────────────────────────────────
  // The same skeleton the route loader shows, so the shape never changes
  // between the two waits.
  if (isLoading) {
    return <TaskDetailPageSkeleton />
  }

  // ─── Error ──────────────────────────────────────────────────────────────
  if (isError || !task) {
    return (
      <div className="min-h-full bg-background">
        <div className={PAGE_SHELL}>
          <div className="rounded-[24px] bg-card p-12 text-center shadow-shell">
            <AlertCircle className="mx-auto mb-4 size-12 text-shell-crit" />
            <p className="font-semibold text-lg mb-2">{t("tasks.detail.failedToLoad")}</p>
            <p className="text-muted-foreground mb-4">{(error as Error)?.message || t("tasks.detail.notFound")}</p>
            <Button variant="outline" size="pill" onClick={() => refetch()}>
              <RefreshCw /> {t("common.retry")}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const onTheJob = !!user?.id && assigneeIds(task).includes(user.id)

  return (
    <div className="min-h-full bg-background">
      <TaskDetailDialogs
        taskId={id}
        task={task}
        showAssignModal={showAssignModal}
        setShowAssignModal={setShowAssignModal}
        showEditDialog={showEditDialog}
        setShowEditDialog={setShowEditDialog}
        isAssigning={assignMutation.isPending}
        onAssign={(memberId) => assignMutation.mutate(memberId)}
        handoverPending={handoverPending}
        reassignNote={reassignNote}
        setReassignNote={setReassignNote}
        clockGateDialog={clockGate.dialogProps}
        officeStartDialog={officeStart.dialogProps}
        stepMoveDialog={stepMove.dialog}
      />

      <div className={PAGE_SHELL}>
        {/* ─── Header ────────────────────────────────────────────────── */}
        <div data-tour="task-header">
          <TaskDetailHeader
            task={task}
            user={user}
            canEdit={canEdit}
            canAssign={canAssign}
            canCancel={canCancel}
            isCompleted={isCompleted}
            isCanceled={isCanceled}
            hasAssignee={hasAssignee}
            hasModule={hasModule}
            allowedTransitions={allowedTransitions}
            onTitleSave={(v) => handleFieldSave("title", v)}
            onStatusChange={(s) => statusChangeMutation.mutate({ status: s })}
            onAssignClick={() => setShowAssignModal(true)}
            onEditClick={() => setShowEditDialog(true)}
            onCancelTask={() => deleteMutation.mutate()}
            isStatusChanging={statusChangeMutation.isPending}
          />
        </div>

        {/* ─── Stopped work: paused, the handover owed, the newest note ─── */}
        <div className="mb-4">
          <HandoverCard
            task={task}
            meId={user?.id}
            canResume={onTheJob && !isCompleted && !isCanceled}
            resuming={resumeMutation.isPending}
            onResume={() => resumeMutation.mutate()}
            onWrite={writeHandover}
          />
        </div>

        {/* ─── Job time: working, with travel and blocked apart ─── */}
        <div className="mb-4 space-y-4">
          {/* Open to a work role: who may take it, how many are taken (shared tasks/role-pool.ts). */}
          <OpenRoleCard task={task} />
          <JobTimeCard taskId={id} paused={!!task.pausedAt} />
          {/* The crew: who is on the job now, who leads (shared tasks/crew.ts). */}
          <TaskCrewCard taskId={id} paused={!!task.pausedAt} />
        </div>

        {/* ─── Progress Card — always visible ─────────────────────── */}
        <div data-tour="task-progress">
          <TaskProgressCard
            assignees={task.assignees || []}
            assignedTo={task.assignedTo || null}
            isCompleted={isCompleted}
            taskStatus={task.status}
            routeStartedAt={task.routeStartedAt}
            routeEndedAt={task.routeEndedAt}
            workflowStatuses={hasWorkflow ? workflowStatuses : undefined}
          />
        </div>

        {/* ─── Two-panel layout ──────────────────────────────────────── */}
        <div className="flex flex-col items-start gap-5 lg:flex-row">
          <TaskDetailMainColumn
            taskId={id}
            task={task}
            canEdit={canEdit}
            isCompleted={isCompleted}
            isCanceled={isCanceled}
            hasAssignee={hasAssignee}
            hasModule={hasModule}
            onFieldSave={handleFieldSave}
            workflowStatuses={workflowStatuses}
            moveWorkflowStatuses={moveWorkflow?.statuses}
            mayReadRoute={mayReadRoute}
            loadingRoute={loadingRoute}
            routeData={routeData}
          />

          {/* Right sidebar — sticky */}
          <div data-tour="task-sidebar" className="w-full lg:sticky lg:top-6 lg:w-[35%] lg:max-w-[440px] lg:shrink-0">
            <TaskDetailSidebar
              task={task}
              canEdit={canEdit}
              canAssign={canAssign}
              hasModule={hasModule}
              onFieldSave={handleFieldSave}
              onAssignClick={() => setShowAssignModal(true)}
              onRemoveAssignee={(assigneeId) => {
                const assignee = task.assignees?.find((a) => a.id === assigneeId)
                if (assignee) {
                  tasksApi
                    .removeAssignee(id, assignee.userId)
                    .then(() => {
                      notify.success(t("tasks.detail.assigneeRemoved"))
                      queryClient.invalidateQueries({ queryKey: keys.tasks.detail(id), refetchType: "all" })
                    })
                    .catch((e: Error) => notify.error(e.message))
                }
              }}
              onSetLead={(assigneeId) => {
                const assignee = task.assignees?.find((a) => a.id === assigneeId)
                if (assignee) {
                  tasksApi
                    .removeAssignee(id, assignee.userId)
                    .then(() => tasksApi.addAssignee(id, assignee.userId, "LEAD"))
                    .then(() => {
                      notify.success(t("tasks.detail.leadUpdated"))
                      queryClient.invalidateQueries({ queryKey: keys.tasks.detail(id), refetchType: "all" })
                    })
                    .catch((e: Error) => notify.error(e.message))
                }
              }}
              sprints={sprints || []}
              phases={phases || []}
              epics={epicsData || []}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

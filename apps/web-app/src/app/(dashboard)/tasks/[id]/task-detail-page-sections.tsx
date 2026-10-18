"use client"

import { keys } from "@/lib/query-keys"
import { tasksApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { TaskProgressCard } from "./_components/task-progress-card"
import { TaskDetailHeader } from "./_components/task-detail-header"
import { TaskDetailSidebar } from "./_components/task-detail-sidebar"
import { HandoverCard } from "./_components/handover-card"
import { JobTimeCard } from "./_components/job-time-card"
import { TaskCrewCard } from "./_components/task-crew-card"
import { OpenRoleCard } from "./_components/open-role-card"
import type { TaskDetailPageState } from "./use-task-detail-page"
import type { TaskDetailPageView } from "./task-detail-page-view"
import { TaskDetailMainColumn } from "./task-detail-main-column"

/** Part of TaskDetailPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function TaskDetailPageSections(
  {
    vm,
    onTheJob,
    subtaskCount,
    openIfPresent,
    checklistTotal,
    checklistDone,
    attachmentCount,
    depCount,
    comments
  }: {
    vm: TaskDetailPageState;
    onTheJob: ReturnType<typeof TaskDetailPageView>['onTheJob'];
    subtaskCount: ReturnType<typeof TaskDetailPageView>['subtaskCount'];
    openIfPresent: ReturnType<typeof TaskDetailPageView>['openIfPresent'];
    checklistTotal: ReturnType<typeof TaskDetailPageView>['checklistTotal'];
    checklistDone: ReturnType<typeof TaskDetailPageView>['checklistDone'];
    attachmentCount: ReturnType<typeof TaskDetailPageView>['attachmentCount'];
    depCount: ReturnType<typeof TaskDetailPageView>['depCount'];
    comments: ReturnType<typeof TaskDetailPageView>['comments']
  }) {
  const {
    task,
    user,
    canEdit,
    canAssign,
    canCancel,
    isCompleted,
    isCanceled,
    hasAssignee,
    hasModule,
    allowedTransitions,
    handleFieldSave,
    statusChangeMutation,
    setShowAssignModal,
    setShowEditDialog,
    deleteMutation,
    resumeMutation,
    writeHandover,
    id,
    hasWorkflow,
    workflowStatuses,
    t,
    queryClient,
    sprints,
    phases,
    epicsData,
    isLoading,
    isError,
  } = vm
  if ((isLoading)) return null
  if ((isError || !task)) return null
  return (
    <div className="p-8 max-w-7xl mx-auto">
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
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <TaskDetailMainColumn
          vm={vm}
          subtaskCount={subtaskCount}
          openIfPresent={openIfPresent}
          checklistTotal={checklistTotal}
          checklistDone={checklistDone}
          attachmentCount={attachmentCount}
          depCount={depCount}
          comments={comments}
        />

        {/* Right sidebar — sticky */}
        <div data-tour="task-sidebar" className="w-full lg:w-[35%] lg:shrink-0 lg:sticky lg:top-6">
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
                tasksApi.removeAssignee(id, assignee.userId).then(() => {
                  notify.success(t("tasks.detail.assigneeRemoved"))
                  queryClient.invalidateQueries({ queryKey: keys.tasks.detail(id), refetchType: "all" })
                }).catch((e: Error) => notify.error(e.message))
              }
            }}
            onSetLead={(assigneeId) => {
              const assignee = task.assignees?.find((a) => a.id === assigneeId)
              if (assignee) {
                tasksApi.removeAssignee(id, assignee.userId).then(() =>
                  tasksApi.addAssignee(id, assignee.userId, "LEAD")
                ).then(() => {
                  notify.success(t("tasks.detail.leadUpdated"))
                  queryClient.invalidateQueries({ queryKey: keys.tasks.detail(id), refetchType: "all" })
                }).catch((e: Error) => notify.error(e.message))
              }
            }}
            sprints={sprints || []}
            phases={phases || []}
            epics={epicsData || []}
          />
        </div>
      </div>
    </div>
  )
}

"use client"

import { keys } from "@/lib/query-keys"
import { ListChecks, Paperclip, MessageCircle, Clock, GitBranch, Link2, FileText, MapPin } from "lucide-react"
import { tasksApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { TaskProgressCard } from "./_components/task-progress-card"
import { CommentsSection } from "./_components/comments-section"
import { CollapsibleSection } from "./_components/collapsible-section"
import { TaskDetailHeader } from "./_components/task-detail-header"
import { TaskDetailSidebar } from "./_components/task-detail-sidebar"
import { DescriptionSection } from "./_components/description-section"
import { HandoverCard } from "./_components/handover-card"
import { JobTimeCard } from "./_components/job-time-card"
import { TaskCrewCard } from "./_components/task-crew-card"
import { OpenRoleCard } from "./_components/open-role-card"
import {
  ServiceReportSection,
  RouteTrackingSection,
  SubtasksSection,
  ChecklistSection,
  AttachmentsSection,
  DependenciesSection,
  ActivitySection,
  CustomFieldsSection,
  StepReportsSection,
} from "./task-detail-page-helpers"
import type { TaskDetailPageState } from "./use-task-detail-page"
import type { TaskDetailPageView } from "./task-detail-page-view"

/** Part of TaskDetailPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function TaskDetailPageSections({ vm, onTheJob, subtaskCount, openIfPresent, checklistTotal, checklistDone, attachmentCount, depCount, comments }: { vm: TaskDetailPageState; onTheJob: ReturnType<typeof TaskDetailPageView>['onTheJob']; subtaskCount: ReturnType<typeof TaskDetailPageView>['subtaskCount']; openIfPresent: ReturnType<typeof TaskDetailPageView>['openIfPresent']; checklistTotal: ReturnType<typeof TaskDetailPageView>['checklistTotal']; checklistDone: ReturnType<typeof TaskDetailPageView>['checklistDone']; attachmentCount: ReturnType<typeof TaskDetailPageView>['attachmentCount']; depCount: ReturnType<typeof TaskDetailPageView>['depCount']; comments: ReturnType<typeof TaskDetailPageView>['comments'] }) {
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
    canAddWork,
    newComment,
    setNewComment,
    commentMutation,
    activityCount,
    setActivityCount,
    moveWorkflow,
    mayReadRoute,
    loadingRoute,
    routeData,
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
        {/* Left panel — scrollable main content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Description — always visible */}
          <div data-tour="task-description">
        <DescriptionSection
          description={task.description}
          canEdit={canEdit}
          onSave={(v) => handleFieldSave("description", v)}
        />
          </div>

          {/* Subtasks — module: subtasks */}
          {hasModule("subtasks") && (
            <div data-tour="task-subtasks">
            <CollapsibleSection id="subtasks" icon={GitBranch} title={t("tasks.sections.subtasks")} count={subtaskCount || undefined} defaultOpen={openIfPresent(subtaskCount)}>
              <SubtasksSection taskId={id} subtasks={task.subtasks} subtaskCount={task._count?.subtasks} canEdit={canAddWork} workflowStatuses={workflowStatuses} />
            </CollapsibleSection>
            </div>
          )}

          {/* Checklist — module: checklists */}
          {hasModule("checklists") && (checklistTotal > 0 || !isCanceled) && (
            <div data-tour="task-checklist">
            <CollapsibleSection id="checklist" icon={ListChecks} title={t("tasks.sections.checklist")} count={checklistTotal > 0 ? `${checklistDone}/${checklistTotal}` : undefined} defaultOpen={openIfPresent(checklistTotal)}>
              <ChecklistSection taskId={id} items={task.checklistItems || []} paused={!!task.pausedAt} spaceId={task.spaceId} />
            </CollapsibleSection>
            </div>
          )}

          {/* Attachments — module: attachments */}
          {hasModule("attachments") && (
            <div data-tour="task-attachments">
            <CollapsibleSection id="attachments" icon={Paperclip} title={t("tasks.sections.attachments")} count={attachmentCount || undefined} defaultOpen={openIfPresent(attachmentCount)}>
              <AttachmentsSection taskId={id} initialAttachments={task.attachments} />
            </CollapsibleSection>
            </div>
          )}

          {/* Dependencies — module: dependencies */}
          {hasModule("dependencies") && (
            <div data-tour="task-dependencies">
            <CollapsibleSection id="dependencies" icon={Link2} title={t("tasks.sections.dependencies")} count={depCount || undefined} defaultOpen={openIfPresent(depCount)}>
              <DependenciesSection taskId={id} predecessors={task.predecessors || []} successors={task.successors || []} canEdit={canAddWork} workflowStatuses={workflowStatuses} />
            </CollapsibleSection>
            </div>
          )}

          {/* Custom Fields — type-scoped; self-hides when the task type has none */}
          <CustomFieldsSection taskId={id} />

          {/* Comments — always visible */}
          <div data-tour="task-comments">
          <CollapsibleSection id="comments" icon={MessageCircle} title={t("tasks.comments.title")} count={comments.length || undefined} defaultOpen>
            <CommentsSection
              comments={comments}
              newComment={newComment}
              onCommentChange={setNewComment}
              onSubmit={() => commentMutation.mutate(newComment.trim())}
              isSubmitting={commentMutation.isPending}
            />
          </CollapsibleSection>
          </div>

          {/* Activity — always visible */}
          <div data-tour="task-activity">
          <CollapsibleSection id="activity" icon={Clock} title={t("tasks.sections.activity")} count={activityCount || undefined}>
            <ActivitySection taskId={id} onCountChange={setActivityCount} />
          </CollapsibleSection>
          </div>

          {/*
            No AuditTrail panel here.
            
            A task already has Activity directly above, and it carries the
            same events with the same actor and timestamp — status changes,
            assignment, comments. Two panels listing one history is not twice
            the accountability, it is the same list read twice; the audit
            record stays reachable in full from the log page, and stays on
            members and spaces where there is no timeline to duplicate.
          */}

          {/* Service Report — module: service_reports + must be completed */}
          {hasModule("service_reports") && (isCompleted || task.status === "CLOSED") && (
            <div data-tour="task-service-report">
          <CollapsibleSection id="service-report" icon={FileText} title={t("tasks.sections.serviceReport")}>
            <ServiceReportSection taskId={id} taskStatus={task.status} />
          </CollapsibleSection>
            </div>
          )}

          {/* Reports — what each step asked when the job moved into it,
              read from the answers' own snapshot. Self-hides when there are
              none; the service report above stays for jobs finished before
              step forms existed, and both show when both exist. */}
          <StepReportsSection taskId={id} workflowStatuses={moveWorkflow?.statuses ?? workflowStatuses} />

          {/* Route Tracking — module + permission, and only when there is a
              route to show OR one being recorded right now.

              Read-only, so unlike the sections above there is nothing to add
              to an empty one; it stays hidden rather than sitting there
              blank. The exception is a task the member is currently driving
              to: the first GPS point can take a minute to arrive, and hiding
              the panel until it does is how someone concludes tracking is
              broken. That in-between state is what the section's "waiting for
              the technician" view is for — which until now could never
              appear, because this gate removed the section before the
              component could render it. Kept mounted while loading so it
              doesn't flash in and out. */}
          {hasModule("tracking") && mayReadRoute &&
            (loadingRoute || (routeData?.points?.length ?? 0) > 0 || task.status === "EN_ROUTE") && (
            <div data-tour="task-route-tracking">
            <CollapsibleSection id="route-tracking" icon={MapPin} title={t("tasks.sections.routeTracking")}>
              <RouteTrackingSection routeData={routeData} isLoading={loadingRoute} hasAssignee={hasAssignee} />
            </CollapsibleSection>
            </div>
          )}
        </div>

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

"use client"

import { ListChecks, Paperclip, MessageCircle, Clock, GitBranch, Link2, FileText, MapPin } from "lucide-react"
import { CommentsSection } from "./_components/comments-section"
import { CollapsibleSection } from "./_components/collapsible-section"
import { DescriptionSection } from "./_components/description-section"
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
import type { TaskDetailPageSections } from "./task-detail-page-sections"

/** Part of the parent component's markup, moved here unchanged; it reads the state from `vm`. */
export function TaskDetailMainColumn({
  vm,
  subtaskCount,
  openIfPresent,
  checklistTotal,
  checklistDone,
  attachmentCount,
  depCount,
  comments,
}: {
  vm: TaskDetailPageState
  subtaskCount: Parameters<typeof TaskDetailPageSections>[0]["subtaskCount"]
  openIfPresent: Parameters<typeof TaskDetailPageSections>[0]["openIfPresent"]
  checklistTotal: Parameters<typeof TaskDetailPageSections>[0]["checklistTotal"]
  checklistDone: Parameters<typeof TaskDetailPageSections>[0]["checklistDone"]
  attachmentCount: Parameters<typeof TaskDetailPageSections>[0]["attachmentCount"]
  depCount: Parameters<typeof TaskDetailPageSections>[0]["depCount"]
  comments: Parameters<typeof TaskDetailPageSections>[0]["comments"]
}) {
  const {
    task,
    canEdit,
    isCompleted,
    isCanceled,
    hasAssignee,
    hasModule,
    handleFieldSave,
    id,
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
  } = vm
  // The parent returns before its markup when there is no task; re-checked here for the type only.
  if (!task) return null
  return (
    <>
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
            <CollapsibleSection
              id="subtasks"
              icon={GitBranch}
              title={t("tasks.sections.subtasks")}
              count={subtaskCount || undefined}
              defaultOpen={openIfPresent(subtaskCount)}
            >
              <SubtasksSection
                taskId={id}
                subtasks={task.subtasks}
                subtaskCount={task._count?.subtasks}
                canEdit={canAddWork}
                workflowStatuses={workflowStatuses}
              />
            </CollapsibleSection>
          </div>
        )}

        {/* Checklist — module: checklists */}
        {hasModule("checklists") && (checklistTotal > 0 || !isCanceled) && (
          <div data-tour="task-checklist">
            <CollapsibleSection
              id="checklist"
              icon={ListChecks}
              title={t("tasks.sections.checklist")}
              count={checklistTotal > 0 ? `${checklistDone}/${checklistTotal}` : undefined}
              defaultOpen={openIfPresent(checklistTotal)}
            >
              <ChecklistSection
                taskId={id}
                items={task.checklistItems || []}
                paused={!!task.pausedAt}
                spaceId={task.spaceId}
              />
            </CollapsibleSection>
          </div>
        )}

        {/* Attachments — module: attachments */}
        {hasModule("attachments") && (
          <div data-tour="task-attachments">
            <CollapsibleSection
              id="attachments"
              icon={Paperclip}
              title={t("tasks.sections.attachments")}
              count={attachmentCount || undefined}
              defaultOpen={openIfPresent(attachmentCount)}
            >
              <AttachmentsSection taskId={id} initialAttachments={task.attachments} />
            </CollapsibleSection>
          </div>
        )}

        {/* Dependencies — module: dependencies */}
        {hasModule("dependencies") && (
          <div data-tour="task-dependencies">
            <CollapsibleSection
              id="dependencies"
              icon={Link2}
              title={t("tasks.sections.dependencies")}
              count={depCount || undefined}
              defaultOpen={openIfPresent(depCount)}
            >
              <DependenciesSection
                taskId={id}
                predecessors={task.predecessors || []}
                successors={task.successors || []}
                canEdit={canAddWork}
                workflowStatuses={workflowStatuses}
              />
            </CollapsibleSection>
          </div>
        )}

        {/* Custom Fields — type-scoped; self-hides when the task type has none */}
        <CustomFieldsSection taskId={id} />

        {/* Comments — always visible */}
        <div data-tour="task-comments">
          <CollapsibleSection
            id="comments"
            icon={MessageCircle}
            title={t("tasks.comments.title")}
            count={comments.length || undefined}
            defaultOpen
          >
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
          <CollapsibleSection
            id="activity"
            icon={Clock}
            title={t("tasks.sections.activity")}
            count={activityCount || undefined}
          >
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
        {hasModule("tracking") &&
          mayReadRoute &&
          (loadingRoute || (routeData?.points?.length ?? 0) > 0 || task.status === "EN_ROUTE") && (
            <div data-tour="task-route-tracking">
              <CollapsibleSection id="route-tracking" icon={MapPin} title={t("tasks.sections.routeTracking")}>
                <RouteTrackingSection routeData={routeData} isLoading={loadingRoute} hasAssignee={hasAssignee} />
              </CollapsibleSection>
            </div>
          )}
      </div>
    </>
  )
}

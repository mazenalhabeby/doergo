"use client"

import { ListChecks, Paperclip, MessageCircle, Clock, GitBranch, Link2, FileText, MapPin } from "lucide-react"
import { CommentsSection } from "./comments-section"
import { CollapsibleSection } from "./collapsible-section"
import { DescriptionSection } from "./description-section"
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
} from "./lazy-sections"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { keys } from "@/lib/query-keys"
import { tasksApi, type Task, type WorkflowStatus } from "@/lib/api"
import { notify } from "@/lib/toast"
import { useAuth } from "@/contexts/auth-context"
import type { RouteData } from "./route-tracking-values"

interface TaskDetailMainColumnProps {
  taskId: string
  task: Task
  canEdit: boolean
  isCompleted: boolean
  isCanceled: boolean
  hasAssignee: boolean
  hasModule: (m: string) => boolean
  onFieldSave: (field: string, value: string) => Promise<void>
  workflowStatuses: WorkflowStatus[]
  /** The statuses of the workflow a move is judged against — the step reports read their forms from it. */
  moveWorkflowStatuses: WorkflowStatus[] | undefined
  mayReadRoute: boolean
  loadingRoute: boolean
  routeData: RouteData | null | undefined
}

/** The job page's left column: description, subtasks, checklist, files, dependencies, fields, comments,
 *  activity, the reports and the route. */
export function TaskDetailMainColumn({
  taskId: id,
  task,
  canEdit,
  isCompleted,
  isCanceled,
  hasAssignee,
  hasModule,
  onFieldSave: handleFieldSave,
  workflowStatuses,
  moveWorkflowStatuses,
  mayReadRoute,
  loadingRoute,
  routeData,
}: TaskDetailMainColumnProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user, hasPermission } = useAuth()
  const isAdmin = user?.role === "ADMIN"
  /*
    May this viewer add work under the task — subtasks, and the dependencies
    that order them?

    The same question the server now asks: `hasPermission` is satisfied by an
    org-wide flag OR a grant held in any space, and the endpoints re-check the
    task's real space. Before this, the Add controls rendered for anyone who
    could SEE the task and failed on submit with a permission error.
  */
  const canAddWork = isAdmin || hasPermission("canCreateTasks")

  // Reported by ActivitySection, which is the only thing that loads the
  // timeline — so the collapsed header can show a count without this page
  // subscribing to a query it has no other use for.
  const [activityCount, setActivityCount] = useState(0)

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

  const comments = task.comments || []
  const checklistDone = task.checklistItems?.filter((i) => i.isCompleted).length ?? 0
  const checklistTotal = task.checklistItems?.length ?? 0
  const depCount = (task.predecessors?.length || 0) + (task.successors?.length || 0)
  const subtaskCount = task.subtasks?.length ?? task._count?.subtasks ?? 0
  const attachmentCount = task.attachments?.length ?? 0

  /**
   * Which sections open on arrival.
   *
   * A section you can ADD to always renders — hiding an empty checklist would
   * remove the only way to create the first item — but it arrives collapsed
   * when there is nothing in it, so the page is quiet without becoming a dead
   * end. Sections you can only READ are hidden outright when empty, below.
   *
   * Every count here comes from the task response the page already has, so
   * deciding this costs no request; and a collapsed section no longer mounts
   * its body, so it costs no query either.
   */
  const openIfPresent = (n: number) => n > 0

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
        <StepReportsSection taskId={id} workflowStatuses={moveWorkflowStatuses ?? workflowStatuses} />

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

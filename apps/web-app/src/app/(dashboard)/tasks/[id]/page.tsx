"use client"

import { useState, use, useEffect, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  RefreshCw,
  AlertCircle,
  ListChecks,
  Paperclip,
  MessageCircle,
  Clock,
  GitBranch,
  Link2,
  FileText,
  MapPin,
  Settings2,
} from "lucide-react"

import { STATUS_TRANSITIONS } from "@hbcfield/shared/client"
import { getStatusConfig } from "@/lib/constants"
import { useAuth } from "@/contexts/auth-context"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { useBreadcrumbOverride } from "@/contexts/breadcrumb-context"
import { TaskDetailPageSkeleton } from "@/components/skeletons"
import { useTaskPermissions } from "@/hooks/use-task-permissions"
import { assigneeIds } from "@/lib/task-assignment"
import { useWorkflow, getTransitionsForStatus } from "@/hooks/use-org-workflow"
import { tasksApi, trackingApi, sprintsApi, phasesApi, epicsApi, type WorkflowStatus } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { notify } from "@/lib/toast"
import { AssignMemberDialog } from "@/components/assign-member-dialog"

import {
  TaskProgressCard,
  RouteTrackingSection,
  ServiceReportSection,
  AttachmentsSection,
  CommentsSection,
  ActivitySection,
  EditTaskDialog,
  ChecklistSection,
  SubtasksSection,
  DependenciesSection,
  CustomFieldsSection,
  CollapsibleSection,
  TaskDetailHeader,
  TaskDetailSidebar,
  DescriptionSection,
} from "./_components"

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, hasModule: orgHasModule } = useAuth()
  const { setOverride, clearOverride } = useBreadcrumbOverride()
  const isAdmin = user?.role === "ADMIN"
  // Org-level, not task-scoped: reaching every task in the org is a flat grant.
  const canViewAllTasks = isAdmin || user?.canViewAllTasks === true

  const [showAssignModal, setShowAssignModal] = useState(false)
  // Reported by ActivitySection, which is the only thing that loads the
  // timeline — so the collapsed header can show a count without this page
  // subscribing to a query it has no other use for.
  const [activityCount, setActivityCount] = useState(0)
  const [showEditDialog, setShowEditDialog] = useState(false)

  // ─── Queries ────────────────────────────────────────────────────────────
  const { data: task, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["task", id],
    queryFn: () => tasksApi.getById(id),
  })

  const { data: routeData, isLoading: loadingRoute } = useQuery({
    queryKey: ["task-route", id],
    queryFn: () => trackingApi.getTaskRoute(id),
    enabled: canViewAllTasks && !!task,
  })

  // Space-aware module resolution
  const { hasModule: spaceHasModule } = useSpaceModules(task?.spaceId || null)
  const hasModule = task?.spaceId ? spaceHasModule : orgHasModule

  /*
    Sidebar selectors for sprints, phases and epics — fetched only when the
    space actually has the module, which is the same gate the sidebar renders
    them behind. These are Business-tier features, so on every other plan this
    was three requests per page view whose results were thrown away.
  */
  const { data: sprints } = useQuery({
    queryKey: ["sprints"],
    queryFn: () => sprintsApi.list(),
    enabled: hasModule("sprints"),
  })
  const { data: phases } = useQuery({
    queryKey: ["phases"],
    queryFn: () => phasesApi.list(),
    enabled: hasModule("phases"),
  })
  const { data: epicsData } = useQuery({
    queryKey: ["epics"],
    queryFn: () => epicsApi.list(),
    enabled: hasModule("epics"),
  })

  useEffect(() => {
    if (task?.title) setOverride(id, task.title)
    return () => clearOverride(id)
  }, [id, task?.title, setOverride, clearOverride])

  // ─── Derived State ──────────────────────────────────────────────────────
  const { statuses: workflowStatuses, hasWorkflow } = useWorkflow(task?.workflowId)

  const isCanceled = hasWorkflow
    ? workflowStatuses.some((s) => s.key === task?.status && s.isCanceled)
    : task?.status === "CANCELED"
  const isCompleted = hasWorkflow
    ? workflowStatuses.some((s) => s.key === task?.status && s.isFinal)
    : task?.status === "COMPLETED" || task?.status === "CLOSED"
  // Anyone on the task, not just the lead. Reading `assignedTo` alone was the
  // same blind spot fixed elsewhere: a task assigned through `assignees[]` with
  // no lead reported as unassigned, which among other things kept the route
  // panel's "waiting for the technician" state from ever showing.
  const hasAssignee = !!task && assigneeIds(task).length > 0

  // What this user may actually do to THIS task, by the same rule the server
  // applies — org flag or the permission in the task's own space.
  const { canEdit, canAssign, canCancel } = useTaskPermissions(
    task ? { spaceId: task.spaceId, isFinished: isCompleted || isCanceled } : null,
  )

  /*
    What this task may become next.

    This used to be [] for any task WITHOUT a custom workflow — which is most of
    them — so the detail page showed a status badge and no way to change it,
    while the board and the list both offered one. The canonical state machine
    is the fallback: the very table the server enforces, so a pill is offered
    exactly when the transition will be accepted.
  */
  const allowedTransitions = useMemo<WorkflowStatus[]>(() => {
    if (!task?.status) return []
    if (hasWorkflow) return getTransitionsForStatus(task.status, workflowStatuses)
    return (STATUS_TRANSITIONS[task.status as keyof typeof STATUS_TRANSITIONS] ?? []).map((key) => {
      const cfg = getStatusConfig(key)
      return { id: key, key, name: cfg.label, color: cfg.hex } as WorkflowStatus
    })
  }, [task?.status, hasWorkflow, workflowStatuses])

  // ─── Mutations ──────────────────────────────────────────────────────────
  const assignMutation = useMutation({
    mutationFn: (workerId: string) => tasksApi.assign(id, workerId),
    onSuccess: () => {
      notify.success(t("tasks.detail.technicianAssigned"))
      setShowAssignModal(false)
      queryClient.invalidateQueries({ queryKey: ["task", id], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      // The list's space tabs are server-counted; a status change or a move
      // between spaces makes those numbers stale.
      queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => tasksApi.updateStatus(id, "CANCELED"),
    onSuccess: () => {
      notify.success(t("tasks.detail.requestCancelled"))
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      // The list's space tabs are server-counted; a status change or a move
      // between spaces makes those numbers stale.
      queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"] })
      queryClient.invalidateQueries({ queryKey: ["task", id] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const statusChangeMutation = useMutation({
    mutationFn: (newStatus: string) => tasksApi.updateStatus(id, newStatus),
    onSuccess: () => {
      notify.success(t("tasks.detail.statusUpdated"))
      queryClient.invalidateQueries({ queryKey: ["task", id], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      // The list's space tabs are server-counted; a status change or a move
      // between spaces makes those numbers stale.
      queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  // Inline field save
  const handleFieldSave = useCallback(async (field: string, value: string) => {
    const parsed = value === "" ? null : (field === "estimatedHours" || field === "storyPoints" ? Number(value) : value)
    await tasksApi.update(id, { [field]: parsed })
    queryClient.invalidateQueries({ queryKey: ["task", id], refetchType: "all" })
  }, [id, queryClient])

  // Comments
  const [newComment, setNewComment] = useState("")
  const commentMutation = useMutation({
    mutationFn: (content: string) => tasksApi.addComment(id, content),
    onSuccess: () => {
      notify.success(t("tasks.detail.commentAdded"))
      setNewComment("")
      queryClient.invalidateQueries({ queryKey: ["task", id], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskTimeline", id], refetchType: "all" })
    },
    onError: (e: Error) => notify.error(e.message),
  })

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

  const comments = task.comments || []
  const checklistDone = task.checklistItems?.filter((i: any) => i.isCompleted).length ?? 0
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
    <div className="min-h-full bg-background">
      {/* Dialogs */}
      <AssignMemberDialog
        open={showAssignModal}
        onOpenChange={setShowAssignModal}
        taskId={id}
        spaceId={task?.spaceId}
        currentAssigneeId={task?.assignedToId}
        currentAssigneeIds={task?.assignees?.map((a: any) => a.userId) || []}
        isAssigning={assignMutation.isPending}
        onAssign={(memberId) => assignMutation.mutate(memberId)}
        onSave={async (added, removed) => {
          const ops: Promise<any>[] = [
            ...removed.map(uid => tasksApi.removeAssignee(id, uid)),
            ...added.map(uid => tasksApi.addAssignee(id, uid)),
          ]
          await Promise.allSettled(ops)
          notify.success(t("tasks.detail.assigneesUpdated"))
          queryClient.invalidateQueries({ queryKey: ["task", id], refetchType: "all" })
        }}
      />
      <EditTaskDialog task={task} open={showEditDialog} onOpenChange={setShowEditDialog} />

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
          onStatusChange={(s) => statusChangeMutation.mutate(s)}
          onAssignClick={() => setShowAssignModal(true)}
          onEditClick={() => setShowEditDialog(true)}
          onCancelTask={() => deleteMutation.mutate()}
          isStatusChanging={statusChangeMutation.isPending}
        />
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
                <SubtasksSection taskId={id} subtasks={task.subtasks} subtaskCount={task._count?.subtasks} />
              </CollapsibleSection>
              </div>
            )}

            {/* Checklist — module: checklists */}
            {hasModule("checklists") && (checklistTotal > 0 || !isCanceled) && (
              <div data-tour="task-checklist">
              <CollapsibleSection id="checklist" icon={ListChecks} title={t("tasks.sections.checklist")} count={checklistTotal > 0 ? `${checklistDone}/${checklistTotal}` : undefined} defaultOpen={openIfPresent(checklistTotal)}>
                <ChecklistSection taskId={id} items={task.checklistItems || []} />
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
                <DependenciesSection taskId={id} predecessors={task.predecessors || []} successors={task.successors || []} />
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
            {hasModule("tracking") && canViewAllTasks &&
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
                const assignee = task.assignees?.find((a: any) => a.id === assigneeId)
                if (assignee) {
                  tasksApi.removeAssignee(id, assignee.userId).then(() => {
                    notify.success(t("tasks.detail.assigneeRemoved"))
                    queryClient.invalidateQueries({ queryKey: ["task", id], refetchType: "all" })
                  }).catch((e: Error) => notify.error(e.message))
                }
              }}
              onSetLead={(assigneeId) => {
                const assignee = task.assignees?.find((a: any) => a.id === assigneeId)
                if (assignee) {
                  tasksApi.removeAssignee(id, assignee.userId).then(() =>
                    tasksApi.addAssignee(id, assignee.userId, "LEAD")
                  ).then(() => {
                    notify.success(t("tasks.detail.leadUpdated"))
                    queryClient.invalidateQueries({ queryKey: ["task", id], refetchType: "all" })
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
    </div>
  )
}

"use client"

import { keys } from "@/lib/query-keys"
import { useRouteAccess } from "@/hooks/use-route-access"
import { useClockGate, useOfficeStart } from "@/hooks"
import { OfficeStartDialog } from "@/components/office-start-dialog"
import { ClockGateDialog } from "@/components/clock-gate-dialog"

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
  MapPin
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
import { tasksApi, trackingApi, sprintsApi, phasesApi, epicsApi, type WorkflowStatus, type OnBehalf } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { notify } from "@/lib/toast"
import { AssignMemberDialog } from "@/components/assign-member-dialog"
import { useStepMove } from "@/components/step-forms/use-step-move"
import { StepReportsSection } from "@/components/step-forms/step-reports-section"
import { serverErrorMessage } from "@/lib/server-error"

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
  HandoverCard,
  JobTimeCard,
  TaskCrewCard,
  OpenRoleCard,
} from "./_components"
import { HandoverPendingNotice, useHandoverPendingText } from "@/components/handover-pending-notice"

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, hasModule: orgHasModule, hasPermission } = useAuth()
  const { setOverride, clearOverride } = useBreadcrumbOverride()
  const isAdmin = user?.role === "ADMIN"
  // Org-level, not task-scoped: reaching every task in the org is a flat grant.
  const canViewAllTasks = isAdmin || hasPermission('canViewAllTasks')
  // The route map shows where a person physically went — its own capability now.
  const canViewTracking = isAdmin || user?.canViewTracking === true || hasPermission('canViewAllTasks')
  /*
    May this viewer add work under the task — subtasks, and the dependencies
    that order them?

    The same question the server now asks: `hasPermission` is satisfied by an
    org-wide flag OR a grant held in any space, and the endpoints re-check the
    task's real space. Before this, the Add controls rendered for anyone who
    could SEE the task and failed on submit with a permission error.
  */
  const canAddWork = isAdmin || hasPermission('canCreateTasks')

  const [showAssignModal, setShowAssignModal] = useState(false)
  // Reported by ActivitySection, which is the only thing that loads the
  // timeline — so the collapsed header can show a count without this page
  // subscribing to a query it has no other use for.
  const [activityCount, setActivityCount] = useState(0)
  const [showEditDialog, setShowEditDialog] = useState(false)

  // ─── Queries ────────────────────────────────────────────────────────────
  const { data: task, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.tasks.detail(id),
    queryFn: () => tasksApi.getById(id),
  })

  // Space-aware module resolution
  const { hasModule: spaceHasModule, isResolved: spaceModulesResolved } = useSpaceModules(task?.spaceId || null)
  const hasModule = task?.spaceId ? spaceHasModule : orgHasModule
  // GET /sprints, /phases, /epics are @RequirePermission('canViewAllTasks') — the ORG-wide flag.
  const readsPlanning = useRouteAccess().holds("org:canViewAllTasks")

  /*
    The route is asked only where it can exist and be read: the task's
    workspace runs Tracking (resolved — not the org fallback shown while the
    workspace's own list loads), and the reader holds what the gateway asks,
    `@RequirePermission('canViewTracking')` as the flat flag (admins pass).
    It was asked of every canViewAllTasks holder on every task — a 403 for a
    dispatcher without tracking, and a wasted request wherever the module is off.
  */
  const mayReadRoute = isAdmin || user?.canViewTracking === true
  const { data: routeData, isLoading: loadingRoute } = useQuery({
    queryKey: keys.tasks.route(id),
    queryFn: () => trackingApi.getTaskRoute(id),
    enabled: mayReadRoute && !!task && spaceModulesResolved && hasModule("tracking"),
  })

  /*
    Sidebar selectors for sprints, phases and epics — fetched only when the
    space actually has the module, which is the same gate the sidebar renders
    them behind. These are Business-tier features, so on every other plan this
    was three requests per page view whose results were thrown away.
  */
  const { data: sprints } = useQuery({
    queryKey: keys.sprints.lists(),
    queryFn: () => sprintsApi.list(),
    enabled: hasModule("sprints") && readsPlanning,
  })
  const { data: phases } = useQuery({
    queryKey: keys.phases.lists(),
    queryFn: () => phasesApi.list(),
    enabled: hasModule("phases") && readsPlanning,
  })
  const { data: epicsData } = useQuery({
    queryKey: keys.epics.lists(),
    queryFn: () => epicsApi.list(),
    enabled: hasModule("epics") && readsPlanning,
  })

  useEffect(() => {
    if (task?.title) setOverride(id, task.title)
    return () => clearOverride(id)
  }, [id, task?.title, setOverride, clearOverride])

  // ─── Derived State ──────────────────────────────────────────────────────
  const { statuses: workflowStatuses, hasWorkflow, workflow: pageWorkflow } = useWorkflow(task?.workflowId)
  /*
    The workflow a move is judged against: the task's EFFECTIVE one as the
    detail read resolves it (its own, else its space's) — which is the one the
    server judges the move by, and the one that carries each step's form.
  */
  const moveWorkflow = task?.workflow ?? pageWorkflow ?? null
  // "Ask when a job moves here": a move into a step with a form opens it first.
  const stepMove = useStepMove()

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
  // A note for whoever takes the job over while a handover is still owed — posted on the job.
  const [reassignNote, setReassignNote] = useState("")
  const assignMutation = useMutation({
    mutationFn: async (workerId: string) => {
      const done = await tasksApi.assign(id, workerId)
      if (reassignNote.trim()) await tasksApi.addComment(id, reassignNote.trim())
      return done
    },
    onSuccess: () => {
      setReassignNote("")
      notify.success(t("tasks.detail.technicianAssigned"))
      setShowAssignModal(false)
      queryClient.invalidateQueries({ queryKey: keys.tasks.detail(id), refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
      // The list's space tabs are server-counted; a status change or a move
      // between spaces makes those numbers stale.
      queryClient.invalidateQueries({ queryKey: keys.tasks.counts() })
    },
    onError: (e: Error) => notify.error(e.message),
  })

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
      queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
      // The list's space tabs are server-counted; a status change or a move
      // between spaces makes those numbers stale.
      queryClient.invalidateQueries({ queryKey: keys.tasks.counts() })
      queryClient.invalidateQueries({ queryKey: keys.tasks.detail(id) })
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
      queryClient.invalidateQueries({ queryKey: keys.tasks.detail(id), refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
      // The list's space tabs are server-counted; a status change or a move
      // between spaces makes those numbers stale.
      queryClient.invalidateQueries({ queryKey: keys.tasks.counts() })
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
    queryClient.invalidateQueries({ queryKey: keys.tasks.detail(id), refetchType: "all" })
    queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
    queryClient.invalidateQueries({ queryKey: keys.tasks.timeline(id), refetchType: "all" })
    queryClient.invalidateQueries({ queryKey: keys.tasks.time(id) })
  }
  const resumeMutation = useMutation({
    mutationFn: () => tasksApi.resumeWork(id),
    onSuccess: () => { notify.success(t("tasks.handover.resumed")); refreshTask() },
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
  const handleFieldSave = useCallback(async (field: string, value: string) => {
    const parsed = value === "" ? null : (field === "estimatedHours" || field === "storyPoints" ? Number(value) : value)
    try {
      await tasksApi.update(id, { [field]: parsed })
    } catch (e) {
      notify.error(e instanceof Error && e.message ? e.message : t("tasks.detail.updateFailed"))
      throw e // let the field restore what was there before
    }
    queryClient.invalidateQueries({ queryKey: keys.tasks.detail(id), refetchType: "all" })
    queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
    queryClient.invalidateQueries({ queryKey: keys.tasks.counts() })
    queryClient.invalidateQueries({ queryKey: keys.tasks.timeline(id), refetchType: "all" })
  }, [id, queryClient, t])

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
  const onTheJob = !!user?.id && assigneeIds(task).includes(user.id)

  return (
    <div className="min-h-full bg-background">
      {/* Dialogs */}
      <AssignMemberDialog
        open={showAssignModal}
        onOpenChange={setShowAssignModal}
        taskId={id}
        spaceId={task?.spaceId}
        currentAssigneeId={task?.assignedToId}
        currentAssigneeIds={task?.assignees?.map((a) => a.userId) || []}
        isAssigning={assignMutation.isPending}
        notice={handoverPending ? <HandoverPendingNotice text={handoverPending} onWait={() => setShowAssignModal(false)} note={reassignNote} onNoteChange={setReassignNote} /> : null}
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
      />
      <EditTaskDialog task={task} open={showEditDialog} onOpenChange={setShowEditDialog} />
      <ClockGateDialog {...clockGate.dialogProps} />
      <OfficeStartDialog {...officeStart.dialogProps} />
      {stepMove.dialog}

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
            {hasModule("tracking") && canViewTracking && mayReadRoute &&
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
    </div>
  )
}

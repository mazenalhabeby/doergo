"use client"

import { keys, invalidateTask } from "@/lib/query-keys"
import { useRouteAccess } from "@/hooks/use-route-access"
import { useState, use, useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { STATUS_TRANSITIONS } from "@hbcfield/shared/client"
import { getStatusConfig } from "@/lib/constants"
import { useAuth } from "@/contexts/auth-context"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { useBreadcrumbOverride } from "@/contexts/breadcrumb-context"
import { useTaskPermissions } from "@/hooks/use-task-permissions"
import { assigneeIds } from "@/lib/task-assignment"
import { useWorkflow, getTransitionsForStatus } from "@/hooks/use-org-workflow"
import { tasksApi, trackingApi, sprintsApi, phasesApi, epicsApi, type WorkflowStatus } from "@/lib/api"
import { notify } from "@/lib/toast"
import { useStepMove } from "@/components/step-forms/use-step-move"

/** useTaskDetailPage's state and handlers — everything before its markup, moved here unchanged. */
export function useTaskDetailPageData({
  params,
}: Pick<Pick<{
  params: Promise<{ id: string }>
}, 'params'>, 'params'>) {
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
    `canViewTracking` org-wide or in THIS task's workspace (admins pass).
    It was asked of every canViewAllTasks holder on every task — a 403 for a
    dispatcher without tracking, and a wasted request wherever the module is off.
  */
  const { canViewRoute: mayReadRoute } = useTaskPermissions(task ? { spaceId: task.spaceId } : null)
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
      // The list's space tabs are server-counted; a status change or a move
      // between spaces makes those numbers stale.
      invalidateTask(queryClient, id, { counts: true })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return {
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
  }
}

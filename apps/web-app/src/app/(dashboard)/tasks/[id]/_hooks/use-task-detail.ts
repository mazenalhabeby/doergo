"use client"

import { keys } from "@/lib/query-keys"
import { useRouteAccess } from "@/hooks/use-route-access"
import { useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { STATUS_TRANSITIONS } from "@hbcfield/shared/client"
import { getStatusConfig } from "@/lib/constants"
import { useAuth } from "@/contexts/auth-context"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { useBreadcrumbOverride } from "@/contexts/breadcrumb-context"
import { useTaskPermissions } from "@/hooks/use-task-permissions"
import { assigneeIds } from "@/lib/task-assignment"
import { useWorkflow, getTransitionsForStatus } from "@/hooks/use-org-workflow"
import { tasksApi, trackingApi, sprintsApi, phasesApi, epicsApi, type WorkflowStatus } from "@/lib/api"
import { useStepMove } from "@/components/step-forms/use-step-move"

/** One job as the detail page reads it: the task, its workspace's modules, its route, the planning lists,
 *  its workflow, and what this viewer may do to it. */
export function useTaskDetail(id: string) {
  const { user, hasModule: orgHasModule } = useAuth()
  const { setOverride, clearOverride } = useBreadcrumbOverride()
  // ─── Queries ────────────────────────────────────────────────────────────
  const {
    data: task,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
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

  return {
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
  }
}

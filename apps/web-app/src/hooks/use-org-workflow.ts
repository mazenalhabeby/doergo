"use client"

import { useQuery } from "@tanstack/react-query"
import { workflowsApi, type StatusWorkflow, type WorkflowStatus } from "@/lib/api"

/**
 * Hook to fetch the organization's workflows and derive the default workflow.
 * Falls back to hardcoded status definitions when no workflow exists.
 */
export function useOrgWorkflow() {
  const { data: workflows, isLoading, isError } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowsApi.list(),
    staleTime: 120000, // 2 minutes
    retry: 1,
  })

  const defaultWorkflow = workflows?.find((w) => w.isDefault) ?? workflows?.[0] ?? null
  const statuses = defaultWorkflow?.statuses ?? []

  return {
    workflows: workflows ?? [],
    defaultWorkflow,
    statuses,
    isLoading,
    isError,
    hasWorkflow: !!defaultWorkflow && statuses.length > 0,
  }
}

/**
 * Hook to fetch a specific workflow by ID (e.g., from a task's workflowId).
 * Falls back to default workflow if no ID is provided.
 */
export function useWorkflow(workflowId?: string | null) {
  const { defaultWorkflow, workflows, isLoading: loadingList, hasWorkflow } = useOrgWorkflow()

  const resolvedId = workflowId ?? defaultWorkflow?.id
  const needsFetch = !!resolvedId && !workflows?.find((w) => w.id === resolvedId)?.statuses?.length

  const { data: fetchedWorkflow, isLoading: loadingDetail } = useQuery({
    queryKey: ["workflow", resolvedId],
    queryFn: () => workflowsApi.getById(resolvedId!),
    enabled: !!resolvedId && needsFetch,
    staleTime: 120000,
    retry: 1,
  })

  // Prefer the full workflow from list (if it has statuses) or the fetched one
  const workflow =
    workflows?.find((w) => w.id === resolvedId && w.statuses?.length) ??
    fetchedWorkflow ??
    defaultWorkflow

  const statuses = workflow?.statuses ?? []

  return {
    workflow,
    workflowId: workflow?.id ?? null,
    statuses,
    isLoading: loadingList || loadingDetail,
    hasWorkflow: hasWorkflow || statuses.length > 0,
  }
}

// ---------------------------------------------------------------------------
// Helpers for building dynamic UI from workflow statuses
// ---------------------------------------------------------------------------

/** Group statuses for tab display */
export interface StatusTabGroup {
  key: string
  label: string
  dotColor: string | null
  statuses: string[] // status keys
}

/**
 * Build dynamic status tabs from workflow statuses.
 * Groups final statuses into "Done", canceled into "Canceled", and
 * creates individual tabs for the rest.
 */
export function buildStatusTabs(statuses: WorkflowStatus[]): StatusTabGroup[] {
  if (!statuses.length) return []

  // Faithful: "All" + one tab per status, in the workflow's own order, using each
  // status's real name/color. No more collapsing finals into "Done" or canceled
  // into "Canceled" — the tabs mirror exactly what the workflow defines.
  const tabs: StatusTabGroup[] = [
    { key: "all", label: "All", dotColor: null, statuses: [] },
  ]

  for (const s of [...statuses].sort((a, b) => a.position - b.position)) {
    tabs.push({
      key: s.key,
      label: s.name,
      dotColor: s.color,
      statuses: [s.key],
    })
  }

  return tabs
}

/**
 * Build kanban columns from workflow statuses.
 * Each non-final, non-canceled status = one column.
 * All final statuses = "Done" column.
 * Canceled statuses are hidden from kanban.
 */
export interface KanbanColumnDef {
  key: string
  label: string
  dotColor: string
  statuses: string[]
  dropStatus: string
  wipLimit?: number
}

export function buildKanbanColumns(statuses: WorkflowStatus[]): KanbanColumnDef[] {
  if (!statuses.length) return []

  // Faithful: one column per status in the workflow's own order, using each
  // status's real name/color/WIP — including each final status as its own column
  // (no hardcoded "Done", no merging). Canceled statuses stay OFF the board
  // (standard kanban practice; canceled tasks are still reachable via the tabs).
  return [...statuses]
    .filter((s) => !s.isCanceled)
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      key: s.key,
      label: s.name,
      dotColor: s.color,
      statuses: [s.key],
      dropStatus: s.key,
      wipLimit: s.wipLimit ?? undefined,
    }))
}

/**
 * Get allowed transitions for a given status from workflow statuses.
 */
export function getTransitionsForStatus(
  currentStatusKey: string,
  statuses: WorkflowStatus[],
): WorkflowStatus[] {
  const currentStatus = statuses.find((s) => s.key === currentStatusKey)
  if (!currentStatus || !currentStatus.transitions) return []

  return currentStatus.transitions
    .map((targetKey) => statuses.find((s) => s.key === targetKey))
    .filter(Boolean) as WorkflowStatus[]
}

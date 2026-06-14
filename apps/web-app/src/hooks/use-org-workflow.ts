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

  const tabs: StatusTabGroup[] = [
    { key: "all", label: "All", dotColor: null, statuses: [] },
  ]

  // Non-final, non-canceled statuses get individual tabs
  const normalStatuses = statuses
    .filter((s) => !s.isFinal && !s.isCanceled)
    .sort((a, b) => a.position - b.position)

  for (const s of normalStatuses) {
    tabs.push({
      key: s.key,
      label: s.name,
      dotColor: s.color,
      statuses: [s.key],
    })
  }

  // Final statuses grouped as "Done"
  const finalStatuses = statuses.filter((s) => s.isFinal && !s.isCanceled)
  if (finalStatuses.length > 0) {
    tabs.push({
      key: "done",
      label: "Done",
      dotColor: finalStatuses[0]?.color ?? "#22C55E",
      statuses: finalStatuses.map((s) => s.key),
    })
  }

  // Canceled statuses grouped
  const canceledStatuses = statuses.filter((s) => s.isCanceled)
  if (canceledStatuses.length > 0) {
    tabs.push({
      key: "canceled",
      label: "Canceled",
      dotColor: canceledStatuses[0]?.color ?? "#94A3B8",
      statuses: canceledStatuses.map((s) => s.key),
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

  const columns: KanbanColumnDef[] = []

  const normalStatuses = statuses
    .filter((s) => !s.isFinal && !s.isCanceled)
    .sort((a, b) => a.position - b.position)

  for (const s of normalStatuses) {
    columns.push({
      key: s.key,
      label: s.name,
      dotColor: s.color,
      statuses: [s.key],
      dropStatus: s.key,
      wipLimit: s.wipLimit ?? undefined,
    })
  }

  const finalStatuses = statuses.filter((s) => s.isFinal && !s.isCanceled)
  if (finalStatuses.length > 0) {
    columns.push({
      key: "done",
      label: "Done",
      dotColor: finalStatuses[0]?.color ?? "#22C55E",
      statuses: finalStatuses.map((s) => s.key),
      dropStatus: finalStatuses[0]?.key ?? "COMPLETED",
    })
  }

  return columns
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

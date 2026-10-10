"use client"

import { useCallback, useMemo } from "react"
import { useQueries } from "@tanstack/react-query"
import { workflowsApi, type WorkflowStatus } from "@/lib/api"
import { getStatusConfig, type StatusConfig } from "@/lib/constants"
import { useOrgWorkflow } from "./use-org-workflow"
import { keys } from "@/lib/query-keys"

/** The flow a task runs on: its own type, else its workspace's. */
export function flowIdOf(task: { workflowId?: string | null; space?: { workflowId?: string | null } | null }): string | null {
  return task.workflowId ?? task.space?.workflowId ?? null
}

/**
 * How a step looks: its name and colour from the task's own flow, the built-in
 * table only for the built-in steps. The fixed table alone knew nothing of
 * DELIVERED or DONE and fell back to its first entry — every finished delivery
 * read "Draft". ONE rule for the list, the calendar and the timeline.
 */
export function stepConfig(status: string, statuses?: readonly WorkflowStatus[] | null): StatusConfig {
  const own = statuses?.find((s) => s.key === status)
  const base = getStatusConfig(status)
  return own ? { ...base, label: own.name, hex: own.color || base.hex } : base
}

/**
 * The step look for every task on a screen that shows many, from several flows
 * at once. The org's list answers most; a flow it does not carry (a workspace's
 * own copy) is fetched once, under the same key `useWorkflow` caches it by.
 */
export function useStepConfigs(tasks: ReadonlyArray<{ workflowId?: string | null; space?: { workflowId?: string | null } | null }>) {
  const { workflows } = useOrgWorkflow()
  const known = useMemo(() => {
    const m = new Map<string, WorkflowStatus[]>()
    for (const w of workflows) if (w.statuses?.length) m.set(w.id, w.statuses)
    return m
  }, [workflows])
  const missing = useMemo(
    () => [...new Set(tasks.map(flowIdOf).filter((id): id is string => !!id && !known.has(id)))],
    [tasks, known],
  )
  const fetched = useQueries({
    queries: missing.map((id) => ({
      queryKey: keys.spaces.workflow(id),
      queryFn: () => workflowsApi.getById(id),
      staleTime: 120000,
      retry: 1,
    })),
  })
  const byFlow = useMemo(() => {
    const m = new Map(known)
    fetched.forEach((q, i) => { if (q.data?.statuses?.length) m.set(missing[i]!, q.data.statuses) })
    return m
    // `fetched` is a new array every render; its data is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known, missing, fetched.map((q) => q.dataUpdatedAt).join(",")])

  return useMemo(() => {
    // One object per flow+step, so a memoised row gets the SAME config each render.
    const seen = new Map<string, StatusConfig>()
    return (task: { status: string; workflowId?: string | null; space?: { workflowId?: string | null } | null }) => {
      const id = flowIdOf(task)
      const key = `${id ?? ""}|${task.status}`
      let cfg = seen.get(key)
      if (!cfg) { cfg = stepConfig(task.status, id ? byFlow.get(id) : null); seen.set(key, cfg) }
      return cfg
    }
  }, [byFlow])
}

/**
 * The step look for tasks shown BESIDE another — its subtasks, its dependencies.
 * A row that names its own flow reads that flow; a row that carries none (a
 * dependency arrives as id/title/status only) reads the flow of the task it
 * hangs off, `fallback`. Both used to keep a fixed colour table of their own, so
 * a custom step ("Delivered") drew as an unknown grey dot.
 */
export function useRelatedStepConfigs(
  rows: ReadonlyArray<{ workflowId?: string | null; space?: { workflowId?: string | null } | null }>,
  fallback?: readonly WorkflowStatus[] | null,
) {
  const own = useStepConfigs(rows)
  return useCallback(
    (row: { status: string; workflowId?: string | null; space?: { workflowId?: string | null } | null }) =>
      flowIdOf(row) ? own(row) : stepConfig(row.status, fallback),
    [own, fallback],
  )
}

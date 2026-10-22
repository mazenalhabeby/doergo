"use client"

import { useQuery } from "@tanstack/react-query"
import { workflowsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"

/** How long the workflow list is fresh. Workflow writes invalidate `keys.workflows`. */
export const WORKFLOWS_STALE_MS = 2 * 60_000

/** The organization's workflows (task types). ONE hook: one cache entry, one refresh time. */
export function useWorkflows({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.workflows.lists(),
    queryFn: () => workflowsApi.list(),
    staleTime: WORKFLOWS_STALE_MS,
    retry: 1,
    enabled,
  })
}

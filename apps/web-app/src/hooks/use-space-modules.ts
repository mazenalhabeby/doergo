"use client"

import { useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"
import { locationsApi } from "@/lib/api"
import { useWorkflow } from "@/hooks/use-org-workflow"
import { keys } from "@/lib/query-keys"

// Module/workflow resolution cascade:
//   space.enabledModules (override) → org feature modules (default)
//   space.workflowId (override)     → org default workflow

/**
 * Effective FEATURE modules for a space.
 * Falls back to the org's feature modules when the space has no override.
 */
export function useSpaceModules(spaceId: string | null) {
  const { user, hasModule: orgHasModule } = useAuth()

  const { data: spaceModules, isSuccess, isError } = useQuery({
    queryKey: keys.spaces.modules(spaceId),
    queryFn: () => locationsApi.getEffectiveModules(spaceId!),
    enabled: !!spaceId,
    staleTime: 60000,
  })
  /** The answer is the workspace's own (or there is no workspace) — not the org fallback used while it loads. */
  const isResolved = !spaceId || isSuccess || isError

  const hasModule = useCallback(
    (module: string) => {
      if (!spaceId) return orgHasModule(module)
      if (spaceModules?.enabledModules) return spaceModules.enabledModules.includes(module)
      return orgHasModule(module)
    },
    [spaceId, spaceModules, orgHasModule],
  )

  const enabledModules = useMemo(() => {
    if (spaceId && spaceModules) return spaceModules.enabledModules
    return user?.orgModules ?? []
  }, [spaceId, spaceModules, user?.orgModules])

  return { hasModule, enabledModules, isResolved }
}

/**
 * Effective workflow (status flow) for a space — the statuses of its assigned
 * workflow, falling back to the org's default workflow.
 */
export function useSpaceWorkflow(spaceId: string | null) {
  const { data: spaceModules } = useQuery({
    queryKey: keys.spaces.modules(spaceId),
    queryFn: () => locationsApi.getEffectiveModules(spaceId!),
    enabled: !!spaceId,
    staleTime: 60000,
  })

  const { statuses, hasWorkflow, workflowId } = useWorkflow(spaceModules?.workflowId ?? null)

  // `workflowId` is the RESOLVED effective workflow (space override, else org
  // default) — the id whose statuses were loaded. Used as the board's default type.
  return { statuses, hasWorkflow, workflowId }
}

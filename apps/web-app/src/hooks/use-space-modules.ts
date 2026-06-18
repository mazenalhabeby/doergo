"use client"

import { useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"
import { locationsApi } from "@/lib/api"
import { useWorkflow } from "@/hooks/use-org-workflow"

// Module/workflow resolution cascade:
//   space.enabledModules (override) → org feature modules (default)
//   space.workflowId (override)     → org default workflow

/**
 * Effective FEATURE modules for a space.
 * Falls back to the org's feature modules when the space has no override.
 */
export function useSpaceModules(spaceId: string | null) {
  const { user, hasModule: orgHasModule } = useAuth()

  const { data: spaceModules } = useQuery({
    queryKey: ["space-modules", spaceId],
    queryFn: () => locationsApi.getEffectiveModules(spaceId!),
    enabled: !!spaceId,
    staleTime: 60000,
  })

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

  return { hasModule, enabledModules }
}

/**
 * Effective workflow (status flow) for a space — the statuses of its assigned
 * workflow, falling back to the org's default workflow.
 */
export function useSpaceWorkflow(spaceId: string | null) {
  const { data: spaceModules } = useQuery({
    queryKey: ["space-modules", spaceId],
    queryFn: () => locationsApi.getEffectiveModules(spaceId!),
    enabled: !!spaceId,
    staleTime: 60000,
  })

  const { statuses, hasWorkflow } = useWorkflow(spaceModules?.workflowId ?? null)

  return { statuses, hasWorkflow }
}

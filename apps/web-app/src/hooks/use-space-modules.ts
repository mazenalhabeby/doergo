"use client"

import { useCallback, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"
import { useWorkflow } from "@/hooks/use-org-workflow"
import { keys } from "@/lib/query-keys"
import { loadSpaceModules } from "@/lib/space-directory"
import { isAdmin, spacesGranting } from "@hbcfield/shared/client"

// Module/workflow resolution cascade:
//   space.enabledModules (override) → org feature modules (default)
//   space.workflowId (override)     → org default workflow
//
// Read from the shared workspace directory on first load (lib/space-directory):
// a task list of nine workspaces used to ask `/locations/:id/modules` nine times
// in the same second.

/**
 * May this person read `GET /locations/:id/modules`? The same rule as the route's gate
 * (`canViewAllTasks` org-wide or in THAT workspace — gateway `scopeFor`). A member's task list shows
 * jobs in workspaces outside their directory; asking each one answered 403 and fell back to the
 * organization's modules — nine refused requests on an employee's Tasks page. Now the fallback is
 * reached without asking.
 */
function mayReadSpaceModules(user: ReturnType<typeof useAuth>["user"], spaceId: string): boolean {
  if (!user) return false
  if (isAdmin(user) || (user as unknown as Record<string, unknown>).canViewAllTasks === true) return true
  const scope = spacesGranting(user.access as never, "canViewAllTasks" as never)
  return scope === null || scope.includes(spaceId)
}

/** The one query behind `keys.spaces.modules(spaceId)` — every caller shares it. */
export function useSpaceModulesQuery(spaceId: string | null, opts: { enabled?: boolean; staleTime?: number } = {}) {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useQuery({
    queryKey: keys.spaces.modules(spaceId),
    queryFn: () =>
      loadSpaceModules(qc, spaceId!, user?.orgModules, { mayAskSpace: mayReadSpaceModules(user, spaceId!) }),
    enabled: !!spaceId && (opts.enabled ?? true),
    staleTime: opts.staleTime ?? 60000,
  })
}

/**
 * Effective FEATURE modules for a space.
 * Falls back to the org's feature modules when the space has no override.
 */
export function useSpaceModules(spaceId: string | null) {
  const { user, hasModule: orgHasModule } = useAuth()

  const { data: spaceModules, isSuccess, isError } = useSpaceModulesQuery(spaceId)
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
  const { data: spaceModules } = useSpaceModulesQuery(spaceId)

  const { statuses, hasWorkflow, workflowId } = useWorkflow(spaceModules?.workflowId ?? null)

  // `workflowId` is the RESOLVED effective workflow (space override, else org
  // default) — the id whose statuses were loaded. Used as the board's default type.
  return { statuses, hasWorkflow, workflowId }
}

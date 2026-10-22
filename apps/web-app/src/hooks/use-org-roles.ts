"use client"

import { useQuery } from "@tanstack/react-query"
import { organizationsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"

/** How long a roles list is fresh. Every write to a role invalidates `keys.organization.roleLists()`. */
export const ROLES_STALE_MS = 5 * 60_000

/**
 * The organization's roles — org-wide ("org", or no scope: the same request) or workspace roles
 * ("space"). ONE hook, so every picker shares one cache entry and one refresh time.
 */
export function useOrgRoles(scope?: "org" | "space", { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.organization.roles(scope),
    queryFn: () => organizationsApi.getRoles(scope),
    staleTime: ROLES_STALE_MS,
    enabled,
  })
}

"use client"

import { useQuery } from "@tanstack/react-query"
import { tasksApi, type RoleOption } from "@/lib/api"
import { keys } from "@/lib/query-keys"

/**
 * The work roles a task in this workspace can be opened to (shared tasks/role-pool.ts).
 *
 * ONE cache entry per workspace, shared by every place that asks — the New Task
 * picker, the task page's "Open to a role" action — so a workspace's roles are
 * read once and reused across its task pages. `enabled` keeps it from being
 * asked at all for somebody who may not assign, or a task with no workspace.
 */
export function useWorkspaceWorkRoles(spaceId: string | null | undefined, enabled = true) {
  const query = useQuery<RoleOption[]>({
    queryKey: keys.spaces.roleOptions(spaceId),
    queryFn: () => tasksApi.roleOptions(spaceId!),
    enabled: !!spaceId && enabled,
    staleTime: 5 * 60_000,
  })
  return { roles: query.data ?? [], loaded: query.isSuccess, hasRoles: (query.data?.length ?? 0) > 0 }
}

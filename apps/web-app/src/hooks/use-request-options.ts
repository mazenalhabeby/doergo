"use client"

import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/contexts/auth-context"
import { employeesApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { LEAVE_ONLY_OPTIONS, type RequestOptions } from "@/lib/requests"

/**
 * Which requests the signed-in member may send, and where a remote day goes.
 *
 * The SERVER decides (the workspace's list × whether this person may work away
 * from a site) — the page only hides what would be refused. Until it answers,
 * or if it cannot, leave alone is offered: what this page always offered.
 */
export function useRequestOptions(enabled = true): RequestOptions & { ready: boolean } {
  const { user } = useAuth()
  const q = useQuery({
    queryKey: keys.timeOff.myOptions(user?.id),
    queryFn: () => employeesApi.getRequestOptions(),
    enabled: enabled && !!user?.id,
    staleTime: 5 * 60_000,
    retry: false,
  })
  return { ...(q.data ?? LEAVE_ONLY_OPTIONS), ready: !q.isLoading }
}

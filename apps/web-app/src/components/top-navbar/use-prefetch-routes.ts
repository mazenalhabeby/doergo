import { keys, membersPageParams } from "@/lib/query-keys"
import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  tasksApi,
  locationsApi,
  organizationsApi,
  sprintsApi,
  epicsApi,
  phasesApi,
} from "@/lib/api"

// ---------------------------------------------------------------------------
// Prefetch helpers — warm React Query cache on nav link hover
// ---------------------------------------------------------------------------
const PREFETCH_STALE = 60_000

export function usePrefetchRoutes(mayListOrg: boolean) {
  const qc = useQueryClient()

  const prefetchDashboard = useCallback(() => {
    // The same request (and so the same key) as the dashboard's own task query.
    qc.prefetchQuery({ queryKey: keys.tasks.list({ limit: 200 }), queryFn: () => tasksApi.list({ limit: 200 }), staleTime: PREFETCH_STALE })
  }, [qc])

  const prefetchTasks = useCallback(() => {
    qc.prefetchQuery({ queryKey: keys.tasks.list({ status: "all", page: 1, limit: 20 }), queryFn: () => tasksApi.list({ status: "all", page: 1, limit: 20 }), staleTime: PREFETCH_STALE })
    qc.prefetchQuery({ queryKey: keys.tasks.counts(), queryFn: () => tasksApi.getStatusCounts(), staleTime: PREFETCH_STALE })
    qc.prefetchQuery({ queryKey: keys.sprints.lists(), queryFn: () => sprintsApi.list(), staleTime: PREFETCH_STALE })
    qc.prefetchQuery({ queryKey: keys.epics.lists(), queryFn: () => epicsApi.list(), staleTime: PREFETCH_STALE })
    qc.prefetchQuery({ queryKey: keys.phases.lists(), queryFn: () => phasesApi.list(), staleTime: PREFETCH_STALE })
    qc.prefetchQuery({ queryKey: keys.locations.list(), queryFn: () => locationsApi.list(), staleTime: PREFETCH_STALE })
  }, [qc])

  const prefetchTeam = useCallback(() => {
    // The directory is canManageUsers (flat flag) — warming it for anybody else is a 403.
    if (!mayListOrg) return
    const firstPage = membersPageParams("", "all", 1)
    qc.prefetchQuery({ queryKey: keys.members.list(firstPage), queryFn: () => organizationsApi.getMembers(firstPage), staleTime: PREFETCH_STALE })
  }, [qc, mayListOrg])

  const prefetchSpaces = useCallback(() => {
    qc.prefetchQuery({ queryKey: keys.locations.list(), queryFn: () => locationsApi.list(), staleTime: PREFETCH_STALE })
  }, [qc])

  const prefetchAttendance = useCallback(() => {
    qc.prefetchQuery({ queryKey: keys.locations.list(), queryFn: () => locationsApi.list(), staleTime: PREFETCH_STALE })
  }, [qc])

  return { prefetchDashboard, prefetchTasks, prefetchTeam, prefetchSpaces, prefetchAttendance }
}

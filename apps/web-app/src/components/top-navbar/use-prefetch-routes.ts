import { keys, membersPageParams } from "@/lib/query-keys"
import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { tasksApi, organizationsApi } from "@/lib/api"
import { fetchSpaceDirectory, spaceDirectoryKey } from "@/lib/space-directory"

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
    // The same keys the task page reads: its counts (one reply carries the
    // workspace tabs AND All/Mine) and the shared workspace directory. The task
    // list itself is keyed by the page's filters, and the planning lists are
    // asked only where their module is on — warming either here would fetch
    // something the page then asks again under another key, or never draws.
    qc.prefetchQuery({ queryKey: keys.tasks.counts({ groupBy: "space" }), queryFn: () => tasksApi.getStatusCounts({ groupBy: "space" }), staleTime: PREFETCH_STALE })
    qc.prefetchQuery({ queryKey: spaceDirectoryKey(), queryFn: fetchSpaceDirectory, staleTime: PREFETCH_STALE })
  }, [qc])

  const prefetchTeam = useCallback(() => {
    // The directory is canManageUsers (flat flag) — warming it for anybody else is a 403.
    if (!mayListOrg) return
    const firstPage = membersPageParams("", "all", 1)
    qc.prefetchQuery({ queryKey: keys.members.list(firstPage), queryFn: () => organizationsApi.getMembers(firstPage), staleTime: PREFETCH_STALE })
  }, [qc, mayListOrg])

  const prefetchSpaces = useCallback(() => {
    qc.prefetchQuery({ queryKey: spaceDirectoryKey(), queryFn: fetchSpaceDirectory, staleTime: PREFETCH_STALE })
  }, [qc])

  const prefetchAttendance = useCallback(() => {
    qc.prefetchQuery({ queryKey: spaceDirectoryKey(), queryFn: fetchSpaceDirectory, staleTime: PREFETCH_STALE })
  }, [qc])

  return { prefetchDashboard, prefetchTasks, prefetchTeam, prefetchSpaces, prefetchAttendance }
}

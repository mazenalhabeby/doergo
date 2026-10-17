"use client"

import { keys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { attendanceApi } from "@/lib/api"

/**
 * Presence self-heal interval. "Online" is derived client-side from
 * lastActiveAt, so a dashboard left open needs a periodic refetch or the cached
 * timestamp ages out of the window and a still-connected member wrongly goes
 * dark. The server bumps lastActiveAt at least once a minute.
 */
export const PRESENCE_REFETCH_MS = 60_000

/**
 * The dashboard's live attendance feeds — moved here unchanged from useDashboardData,
 * which calls this at the same point, so the queries run in the same order.
 */
export function useAttendanceFeeds(canReadAttendance: boolean, afterFirstLoad: boolean) {
  // Who is clocked in RIGHT NOW? Admins read org-wide. This is date-independent
  // (open entries only) so an overnight / still-open shift that started before
  // midnight still counts — a single-day query would drop them after the date
  // rolls over. Employees can't read this (403); they fetch presence per space.
  const { data: attendanceData } = useQuery({
    queryKey: keys.attendance.active(),
    queryFn: () => attendanceApi.getActiveEntries(),
    staleTime: 30000,
    enabled: canReadAttendance,
    // Safety refetch so clock-in/out state self-heals if a socket event is missed.
    refetchInterval: PRESENCE_REFETCH_MS,
  })

  // Active breaks — who is currently on break? (admin-only endpoint)
  // getActiveBreaks() already unwraps the envelope and resolves to Break[], so
  // the failure fallback must be an array too.
  //
  // After the first load: it only turns a present member's label into "On
  // break", a moment after the grid has drawn them present.
  const { data: activeBreaks } = useQuery({
    queryKey: keys.attendance.dashboardBreaks(),
    queryFn: () => attendanceApi.getActiveBreaks().catch(() => []),
    staleTime: 30000,
    enabled: canReadAttendance && afterFirstLoad,
  })

  // Attendance entries awaiting approval — feeds the "Pending Actions" panel so
  // admins see payroll-blocking approvals from anywhere, not just the Attendance tab.
  //
  // After the first load (useAfterFirstLoad): the list it feeds sits in the side
  // panel among the task-derived items and grows by these rows a moment later,
  // while the grid and the presence it draws first go out with the page.
  const { data: pendingApprovalsData } = useQuery({
    queryKey: keys.attendance.pendingApprovals(),
    queryFn: () => attendanceApi.getPendingApprovals({ limit: 50 }).catch(() => ({ data: [] })),
    staleTime: 30000,
    enabled: canReadAttendance && afterFirstLoad,
  })

  return { attendanceData, activeBreaks, pendingApprovalsData }
}

"use client"

import { useCallback, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"
import { organizationsApi, employeesApi } from "@/lib/api"

/**
 * Everything `/members/[id]` needs to fetch, and everything derived from it.
 *
 * The page was a single ~640-line component owning eight queries, the permission
 * derivation, three pieces of view state, the refresh-all callback AND the whole
 * layout (audit MD-E2). Splitting the data half out follows the pattern the
 * dashboard already uses (`dashboard/_lib/use-dashboard-data.ts`) and makes the
 * gating testable without rendering anything.
 *
 * The tab-gated queries stay gated: four of the eight only run when their tab is
 * open, which is why `activeTab` is owned here rather than by the page.
 */

const TASKS_PAGE_SIZE = 20
/** How far back the attendance tab looks — bounds a long-tenured member's history (P4). */
const ATTENDANCE_WINDOW_DAYS = 90

export function useMemberData(memberId: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const isAdmin = user?.role === "ADMIN"
  // Manager+ may see the operational tabs (tasks/attendance/schedule/perf) and
  // manage schedules/attendance — same gate the retired /employees page used.
  const canViewOps = isAdmin || !!user?.canViewAllTasks
  const canManage = canViewOps
  // Editing a member's role / access. Mirrors the server exactly:
  // PATCH /organizations/members/:id is @RequirePermission('canManageUsers').
  const canManageMembers = isAdmin || !!user?.canManageUsers

  const [activeTab, setActiveTab] = useState("overview")
  const [tasksPage, setTasksPage] = useState(1)

  const attendanceRange = useMemo(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - ATTENDANCE_WINDOW_DAYS)
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    }
  }, [])

  // One member by id (single row, same shape as a list row) — not the whole org
  // find()-ed client-side, which broke past 200 members (P1).
  const {
    data: member,
    isLoading: memberLoading,
    isError: memberError,
    refetch: refetchMember,
  } = useQuery({
    queryKey: ["orgMember", memberId],
    queryFn: () => organizationsApi.getMember(memberId),
    enabled: !!memberId,
  })

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["memberTasks", memberId],
    queryFn: () => employeesApi.getTasks(memberId, { limit: 5 }),
    enabled: !!memberId,
  })

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery({
    queryKey: ["employeeSchedule", memberId],
    queryFn: () => employeesApi.getSchedule(memberId),
    enabled: !!memberId,
  })

  // This member's space assignments in ONE call (was an N+1 fan-out over every
  // location just to build the header badges). Feeds the header and Locations tab (P2).
  const { data: memberAssignments = [] } = useQuery({
    queryKey: ["memberLocationAssignments", memberId],
    queryFn: () => employeesApi.getAssignments(memberId),
    enabled: !!memberId,
    staleTime: 30_000,
  })

  // ── Operational tabs (manager+ only) — each fetches ONLY when its tab is open ──
  const { data: fullTasks } = useQuery({
    queryKey: ["memberTasksFull", memberId, tasksPage],
    queryFn: () => employeesApi.getTasks(memberId, { page: tasksPage, limit: TASKS_PAGE_SIZE }),
    enabled: !!memberId && canViewOps && activeTab === "tasks",
    staleTime: 30_000,
  })

  const { data: attendance } = useQuery({
    queryKey: ["memberAttendance", memberId, attendanceRange.startDate, attendanceRange.endDate],
    queryFn: () =>
      employeesApi.getAttendance(memberId, attendanceRange.startDate, attendanceRange.endDate),
    enabled: !!memberId && canViewOps && activeTab === "attendance",
    staleTime: 30_000,
  })

  const { data: performance } = useQuery({
    queryKey: ["memberPerformance", memberId],
    queryFn: () => employeesApi.getPerformance(memberId),
    enabled: !!memberId && canViewOps && activeTab === "performance",
    staleTime: 30_000,
  })

  // Header stats (Score · Done · Active · This Week) — one call carries the lot.
  const { data: memberProfile } = useQuery({
    queryKey: ["employeeProfile", memberId],
    queryFn: () => employeesApi.getById(memberId),
    enabled: !!memberId && canViewOps,
    staleTime: 60_000,
  })

  const spaceNames = useMemo(
    () => memberAssignments.map((a) => a.location?.name).filter(Boolean) as string[],
    [memberAssignments],
  )

  /**
   * After an edit / access change, refresh the member AND its dependent tabs —
   * editing can change any of them, so refetching only the member left siblings
   * stale (D5).
   */
  const handleMemberSaved = useCallback(() => {
    refetchMember()
    for (const key of [
      "employeeSchedule",
      "memberLocationAssignments",
      "memberTasks",
      "memberTasksFull",
      "memberAttendance",
      "memberPerformance",
    ]) {
      queryClient.invalidateQueries({ queryKey: [key, memberId] })
    }
  }, [queryClient, refetchMember, memberId])

  return {
    // permissions
    isAdmin, canViewOps, canManage, canManageMembers,
    /** The viewer's own id — the page needs it to refuse self-edit. */
    currentUserId: user?.id,
    // view state
    activeTab, setActiveTab, tasksPage, setTasksPage, attendanceRange,
    // data
    member, tasks, schedule: scheduleData?.schedule || [], memberAssignments,
    spaceNames, fullTasks, attendance, performance, memberProfile,
    // status
    memberLoading, memberError, tasksLoading, scheduleLoading,
    // actions
    refetchMember, handleMemberSaved,
    // constants the view needs for pagination maths
    tasksPageSize: TASKS_PAGE_SIZE,
  }
}

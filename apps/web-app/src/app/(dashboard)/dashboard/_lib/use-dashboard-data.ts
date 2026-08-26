"use client"

import { useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

import { getSpaceScope } from "@hbcfield/shared/client"
import type { TimeEntry } from "@hbcfield/shared"
import {
  attendanceApi,
  locationsApi,
  organizationsApi,
  tasksApi,
  type LocationAssignment,
  type OrgMember,
  type Task,
} from "@/lib/api"
import { fetchAllPages } from "@/lib/paginate"
import { assigneeIds } from "@/lib/task-assignment"

import { getTodayString, isClockedIn } from "../_components/helpers"
import type { AttendanceFacts } from "./build-workspace-boxes"
import { buildPresenceDirectory } from "./presence-directory"

/**
 * Everything the dashboard reads, and the shapes it reads it into.
 *
 * Separated from the page so the component is presentation: which layout, which
 * cards, which panel. Each query is gated on the permission its endpoint
 * actually requires, so a viewer never fires a request that can only 403.
 */

/** Server hard cap for /organizations/members and /locations (one page each). */
const MEMBERS_PAGE_SIZE = 200
const SPACES_PAGE_SIZE = 500

/**
 * Newest tasks pulled for the activity feed, per-space alert counts and the
 * "who is on a task" cards. Deliberately a slice, not the full history: the
 * dashboard only ever renders the most recent handful, so paging the entire
 * backlog in would cost payload for rows nothing displays. An org that outgrows
 * this needs server-side aggregation, not a bigger page.
 */
const DASHBOARD_TASK_LIMIT = 200

/**
 * Presence self-heal interval. "Online" is derived client-side from
 * lastActiveAt, so a dashboard left open needs a periodic refetch or the cached
 * timestamp ages out of the window and a still-connected member wrongly goes
 * dark. The server bumps lastActiveAt at least once a minute.
 */
const PRESENCE_REFETCH_MS = 60_000

/** Stable empty default — a `= []` literal would be a new identity each render. */
const NO_MEMBERS: OrgMember[] = []

export interface DashboardUser {
  id?: string
  role?: string
  canViewAllTasks?: boolean
  canManageUsers?: boolean
  enabledModules?: unknown
}

export function useDashboardData(user: DashboardUser | null | undefined) {
  const isAdminOrDispatcher = user?.role === "ADMIN" || !!user?.canViewAllTasks
  // Access-Profile space scope: 'all' | 'own' | 'tasks'. Admins/managers always
  // see every space. Resolved before the queries because it decides whether the
  // spaces request is worth making at all.
  const spaceScope = getSpaceScope(user ?? {})
  const showsSpaces = isAdminOrDispatcher || spaceScope !== "tasks"

  // ── Data Fetching ──────────────────────────────────────────────────────────

  // Tasks. Kept current by the socket layer — useRealtimeSync invalidates
  // ["tasks"] on every task event — so there is no polling interval here.
  const { data: tasksData, isLoading: loadingTasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => tasksApi.list({ limit: DASHBOARD_TASK_LIMIT }),
  })

  // Company spaces. Paged through to the end: /locations defaults to 20 per
  // page, so requesting a single page silently dropped every space past the
  // 20th from the grid, its alerts and its roster.
  const { data: locationsData, isLoading: loadingLocations } = useQuery({
    queryKey: ["locations", "dashboard"],
    queryFn: () => fetchAllPages((page) => locationsApi.list({ page, limit: SPACES_PAGE_SIZE })),
    // A 'tasks'-scope member sees no spaces by definition; the server ran the
    // full query and then discarded every row for them. Don't ask.
    enabled: showsSpaces,
  })

  // All org members (for worker info: name, avatar, workMode, role).
  //
  // GET /organizations/members requires canManageUsers, so this is gated on that
  // permission: without the gate every employee re-fired a request that could
  // only ever 403, once a minute, for as long as the tab stayed open. Viewers
  // who can't read the directory fall back to the member data embedded in their
  // (scoped) space rosters — see memberMap below.
  const canReadMembers = !!user?.canManageUsers
  const { data: members = NO_MEMBERS } = useQuery({
    // Keep under the "orgMembers" namespace so member add/remove/role mutations
    // (which invalidate ["orgMembers"]) also refresh this dashboard list.
    queryKey: ["orgMembers", "dashboard"],
    queryFn: () =>
      fetchAllPages<OrgMember>((page) =>
        // `lite`: this list is drawn as faces and names and refreshed every
        // minute for presence. It has no use for Access Profiles, contact
        // allow-lists or the role join, which are the expensive columns.
        organizationsApi.getMembers({ page, limit: MEMBERS_PAGE_SIZE, lite: true }),
      ),
    enabled: canReadMembers,
    staleTime: 30000,
    refetchOnMount: true,
    refetchInterval: PRESENCE_REFETCH_MS,
  })

  // Who is clocked in RIGHT NOW? Admins read org-wide. This is date-independent
  // (open entries only) so an overnight / still-open shift that started before
  // midnight still counts — a single-day query would drop them after the date
  // rolls over. Employees can't read this (403); they fetch presence per space.
  const { data: attendanceData } = useQuery({
    queryKey: ["attendance-active"],
    queryFn: () => attendanceApi.getActiveEntries(),
    staleTime: 30000,
    enabled: isAdminOrDispatcher,
    // Safety refetch so clock-in/out state self-heals if a socket event is missed.
    refetchInterval: PRESENCE_REFETCH_MS,
  })

  // Active breaks — who is currently on break? (admin-only endpoint)
  // getActiveBreaks() already unwraps the envelope and resolves to Break[], so
  // the failure fallback must be an array too.
  const { data: activeBreaks } = useQuery({
    queryKey: ["active-breaks"],
    queryFn: () => attendanceApi.getActiveBreaks().catch(() => []),
    staleTime: 30000,
    enabled: isAdminOrDispatcher,
  })

  // Attendance entries awaiting approval — feeds the "Pending Actions" panel so
  // admins see payroll-blocking approvals from anywhere, not just the Attendance tab.
  const { data: pendingApprovalsData } = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: () => attendanceApi.getPendingApprovals({ limit: 50 }).catch(() => ({ data: [] })),
    staleTime: 30000,
    enabled: isAdminOrDispatcher,
  })

  // ── Derived Data ───────────────────────────────────────────────────────────

  // These MUST be memoised: `response?.data || []` allocates a new array every
  // render, which changes the identity of every dependency array they appear in
  // — the big workspaceBoxes memo below then recomputed on each render instead
  // of only when the data actually changed.
  const tasks: Task[] = useMemo(() => tasksData?.data ?? [], [tasksData])
  const allLocations = useMemo(() => locationsData ?? [], [locationsData])

  // Set of user IDs currently on break.
  //
  // This read used to be `(activeBreaksData as any)?.data || []` and then keyed
  // on `b.userId`. Both were wrong: the API helper resolves to a Break[] (no
  // `.data`), and the server flattens the owner onto `user`, never `userId`. So
  // the set was ALWAYS EMPTY and nobody ever got the "On Break" label — the
  // `as any` is what kept the compiler quiet about both.
  const onBreakUserIds = useMemo(() => {
    const set = new Set<string>()
    for (const b of activeBreaks ?? []) {
      if (b.user?.id) set.add(b.user.id)
    }
    return set
  }, [activeBreaks])

  // Location assignments — fetch per location
  const locationIds = useMemo(
    () => allLocations.filter((l: { isActive: boolean }) => l.isActive).map((l: { id: string }) => l.id),
    [allLocations],
  )

  const locKey = locationIds.join(",")

  // Batched rosters (with each member's current task) for ALL visible spaces in
  // ONE request — replaces the previous one-request-per-location fan-out.
  const { data: rostersData } = useQuery({
    queryKey: ["locationRosters", locKey],
    queryFn: () => locationsApi.getRosters(locationIds),
    enabled: locationIds.length > 0,
    staleTime: 60000,
  })
  const rosters: LocationAssignment[] = useMemo(() => rostersData || [], [rostersData])

  // Batched attendance for employees (admins use the org-wide query above), again
  // one request for all their spaces instead of one per space.
  const { data: batchAttendance } = useQuery({
    queryKey: ["locationAttendanceBatch", locKey, getTodayString()],
    queryFn: () => attendanceApi.getEntriesBatch(locationIds, getTodayString()),
    enabled: !isAdminOrDispatcher && locationIds.length > 0,
    staleTime: 30000,
  })

  // Today's presence entries: admins read org-wide; employees use the batch.
  const todayEntries: TimeEntry[] = useMemo(() => {
    if (isAdminOrDispatcher) return attendanceData?.data || []
    return batchAttendance || []
  }, [isAdminOrDispatcher, attendanceData, batchAttendance])

  // Build the member lookup. Admins/managers get the full org member list; for
  // employees (who can't read /organizations/members) we fall back to the user
  // details embedded in the scoped location rosters — so their space still
  // shows real names/avatars without exposing the whole directory.
  // Managers cannot read the directory, so presence falls back to the people
  // their attendance feed names — see buildPresenceDirectory.
  const presenceDirectory = useMemo(
    () => buildPresenceDirectory({ members, todayEntries, isAdminOrDispatcher }),
    [members, todayEntries, isAdminOrDispatcher],
  )

  const memberMap = useMemo(() => {
    const map = new Map<string, OrgMember>()
    for (const a of rosters) {
      if (a.user && !map.has(a.user.id)) {
        map.set(a.user.id, { ...a.user, isActive: true, role: "EMPLOYEE" } as unknown as OrgMember)
      }
    }
    // Fuller records take precedence — the real directory first, then anything
    // reconstructed from attendance for viewers who cannot read it.
    for (const m of presenceDirectory) if (!map.has(m.id)) map.set(m.id, m)
    for (const m of members) map.set(m.id, m)
    return map
  }, [members, presenceDirectory, rosters])

  // Per-user attendance facts, derived in ONE pass. Previously the same array
  // was copied and re-sorted three times to build three parallel maps keyed by
  // the same user and read from the same (most recent) entry.
  //
  // `clockedIn` is true when ANY of today's entries is open; the descriptive
  // fields come from the most recent entry, which is what the presence labels
  // describe. Identical results to the three maps it replaces.
  const { clockedInUserIds, attendanceByUser } = useMemo(() => {
    const clocked = new Set<string>()
    const facts = new Map<string, AttendanceFacts>()

    // Newest first, so the first entry seen per user IS their most recent.
    const byRecency = [...todayEntries].sort(
      (a, b) => new Date(b.clockInAt).getTime() - new Date(a.clockInAt).getTime(),
    )

    for (const entry of byRecency) {
      if (isClockedIn(entry)) clocked.add(entry.userId)
      if (!facts.has(entry.userId)) {
        facts.set(entry.userId, {
          locationId: entry.locationId,
          isRemote: !!entry.isRemote,
          withinGeofence: !!entry.clockInWithinGeofence,
          // ESCALATED = the reminder engine chased this session to its limit,
          // got nothing back, handed it to a leader and stopped. Everything
          // else ('REMINDED', an open overtime request) is still in flight and
          // should keep reading as a normal shift.
          needsReview: entry.reminderState === "ESCALATED",
        })
      }
    }

    return { clockedInUserIds: clocked, attendanceByUser: facts }
  }, [todayEntries])

  // locationId -> { is this space shift-based, does it have a real geofence }.
  const spaceMetaByLocation = useMemo(() => {
    const map = new Map<string, { isShiftBased: boolean; hasLocation: boolean }>()
    for (const l of allLocations as Array<{ id: string; workModel?: string; lat?: number | null; lng?: number | null }>) {
      const wm = l.workModel || "NONE"
      map.set(l.id, {
        isShiftBased: wm === "SHIFT" || wm === "FIXED",
        hasLocation: l.lat != null && l.lng != null,
      })
    }
    return map
  }, [allLocations])

  // Resolve the On Shift / In Field / Working inputs for a worker from their
  // current clock-in space. "atSpace" is true only when the space has a real
  // geofence AND they clocked in inside it — no location ⇒ can't confirm ⇒ In Field.
  const shiftLabelInfo = useCallback(
    (userId: string): { isShiftBased: boolean; atSpace: boolean } => {
      const locId = attendanceByUser.get(userId)?.locationId
      const meta = locId ? spaceMetaByLocation.get(locId) : undefined
      const within = attendanceByUser.get(userId)?.withinGeofence ?? false
      return {
        isShiftBased: meta?.isShiftBased ?? false,
        atSpace: (meta?.hasLocation ?? false) && within === true,
      }
    },
    [attendanceByUser, spaceMetaByLocation],
  )

  // Map userId -> active task (highest priority: IN_PROGRESS > EN_ROUTE > ARRIVED > BLOCKED).
  // Credited to EVERY assignee, not just the lead: a co-assignee working the task
  // showed no current task at all when this keyed off assignedToId alone.
  const activeTaskMap = useMemo(() => {
    const map = new Map<string, Task>()
    const priority: Record<string, number> = {
      IN_PROGRESS: 4,
      ARRIVED: 3,
      EN_ROUTE: 2,
      BLOCKED: 1,
    }
    for (const task of tasks) {
      const p = priority[task.status]
      if (p === undefined) continue
      for (const assigneeId of assigneeIds(task)) {
        const existing = map.get(assigneeId)
        if (!existing || (priority[existing.status] || 0) < p) {
          map.set(assigneeId, task)
        }
      }
    }
    return map
  }, [tasks])

  // Active task per member as computed server-side on the roster. Employees can
  // only read their own tasks, so this is how their dashboard learns which
  // colleagues are currently working (presence parity with the admin view).
  const rosterActiveTaskMap = useMemo(() => {
    const map = new Map<string, { title: string; status: string }>()
    for (const a of rosters) {
      if (a.currentTask) {
        map.set(a.userId, { title: a.currentTask, status: a.currentTaskStatus || "IN_PROGRESS" })
      }
    }
    return map
  }, [rosters])

  // Assignments per location: locationId -> userId[]
  const assignmentsPerLocation = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const locId of locationIds) map.set(locId, new Set<string>())
    for (const a of rosters) {
      if (!map.has(a.locationId)) map.set(a.locationId, new Set<string>())
      map.get(a.locationId)!.add(a.userId)
    }
    return map
  }, [locationIds, rosters])


  const pendingApprovals: TimeEntry[] = useMemo(
    () => (pendingApprovalsData as { data?: TimeEntry[] } | undefined)?.data || [],
    [pendingApprovalsData],
  )

  // A disabled query never leaves isLoading, so only count the spaces request
  // while it is actually being made.
  const isLoading = loadingTasks || (showsSpaces && loadingLocations)

  return {
    // access
    isAdminOrDispatcher,
    spaceScope,
    showsSpaces,
    isLoading,
    // raw
    tasks,
    allLocations,
    /** Presence list: the directory, or its attendance-derived stand-in. */
    members: presenceDirectory,
    rosters,
    todayEntries,
    pendingApprovals,
    locationIds,
    // derived
    memberMap,
    clockedInUserIds,
    attendanceByUser,
    onBreakUserIds,
    spaceMetaByLocation,
    shiftLabelInfo,
    activeTaskMap,
    rosterActiveTaskMap,
    assignmentsPerLocation,
  }
}

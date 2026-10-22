"use client"

import { keys } from "@/lib/query-keys"
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
import { useSpaceDirectory } from "@/hooks/use-space-directory"
import { useAfterFirstLoad } from "@/hooks/use-after-first-load"

import { todayKey } from "@hbcfield/shared/client"
import {
  memberMapOf,
  attendanceFactsOf,
  spaceMetaOf,
  activeTaskMapOf,
  rosterActiveTaskMapOf,
  assignmentsPerLocationOf,
} from "./dashboard-derive"
import { PRESENCE_REFETCH_MS, useAttendanceFeeds } from "./use-attendance-feeds"
import { buildPresenceDirectory } from "./presence-directory"
import { useAuth } from "@/contexts/auth-context"

/**
 * Everything the dashboard reads, and the shapes it reads it into.
 *
 * Separated from the page so the component is presentation: which layout, which
 * cards, which panel. Each query is gated on the permission its endpoint
 * actually requires, so a viewer never fires a request that can only 403.
 */

/**
 * Newest tasks pulled for the activity feed, per-space alert counts and the
 * "who is on a task" cards. Deliberately a slice, not the full history: the
 * dashboard only ever renders the most recent handful, so paging the entire
 * backlog in would cost payload for rows nothing displays. An org that outgrows
 * this needs server-side aggregation, not a bigger page.
 */
const DASHBOARD_TASK_LIMIT = 200

/** Stable empty default — a `= []` literal would be a new identity each render. */
const NO_MEMBERS: OrgMember[] = []

interface DashboardUser {
  id?: string
  role?: string
  canViewAllTasks?: boolean
  canManageUsers?: boolean
  enabledModules?: unknown
}

export function useDashboardData(user: DashboardUser | null | undefined) {
  const { hasPermission } = useAuth()
  // Space-aware: "view all tasks" held by a SPACE role counts here too, or a
  // member whose only authority is a space gets the narrow employee dashboard.
  const isAdminOrDispatcher = user?.role === "ADMIN" || hasPermission("canViewAllTasks")
  // Access-Profile space scope: 'all' | 'own' | 'tasks'. Admins/managers always
  // see every space. Resolved before the queries because it decides whether the
  // spaces request is worth making at all.
  const spaceScope = getSpaceScope(user ?? {})
  /*
    Who may read the live attendance feeds (active entries, active breaks,
    pending approvals): the gateway gates all three on
    `@RequirePermissionInSpace('canViewSpaceAttendance')` — held org-wide or in
    any workspace, admins always. It was asked as canViewAllTasks, so a
    dispatcher without attendance polled three 403s a minute, and a shift
    supervisor who holds attendance saw no presence at all.
  */
  const canReadAttendance = user?.role === "ADMIN" || hasPermission("canViewSpaceAttendance")
  // Reads the first paint does not need wait for it (hooks/use-after-first-load).
  const afterFirstLoad = useAfterFirstLoad(2)
  const showsSpaces = isAdminOrDispatcher || spaceScope !== "tasks"

  // ── Data Fetching ──────────────────────────────────────────────────────────

  // Tasks. Kept current by the socket layer — useRealtimeSync invalidates
  // keys.tasks.lists() on every task event — so there is no polling interval here.
  const { data: tasksData, isLoading: loadingTasks } = useQuery({
    queryKey: keys.tasks.list({ limit: DASHBOARD_TASK_LIMIT }),
    queryFn: () => tasksApi.list({ limit: DASHBOARD_TASK_LIMIT }),
  })

  // Company spaces — the shared workspace directory (lib/space-directory), paged
  // through to the end, which the shell and the task page read too; the grid
  // shows the active ones. A 'tasks'-scope member sees no spaces by definition,
  // so don't ask.
  const { data: directory, isLoading: loadingLocations } = useSpaceDirectory({ enabled: showsSpaces })
  const locationsData = useMemo(
    () => (directory ? directory.filter((l) => l.isActive !== false) : undefined),
    [directory],
  )

  // All org members (for worker info: name, avatar, workMode, role).
  //
  // GET /organizations/members requires canManageUsers, so this is gated on that
  // permission: without the gate every employee re-fired a request that could
  // only ever 403, once a minute, for as long as the tab stayed open. Viewers
  // who can't read the directory fall back to the member data embedded in their
  // (scoped) space rosters — see memberMap below.
  const canReadMembers = !!user?.canManageUsers
  /*
    The boxes are drawn from the rosters, which carry each person's name; the directory adds faces
    and presence on top. So it follows the first paint (the request budget) — wave 1, ahead of the
    side lists.
  */
  const membersAfterLoad = useAfterFirstLoad(1)
  const { data: members = NO_MEMBERS } = useQuery({
    // The directory, lite: member add/remove/role mutations invalidate
    // keys.members.lists(), which this is one of.
    queryKey: keys.members.directoryLite(),
    // `lite`: this list is drawn as faces and names and refreshed every
    // minute for presence. It has no use for Access Profiles, contact
    // allow-lists or the role join, which are the expensive columns.
    queryFn: () => organizationsApi.getAllMembers({ lite: true }),
    enabled: canReadMembers && membersAfterLoad,
    staleTime: 30000,
    refetchOnMount: true,
    refetchInterval: PRESENCE_REFETCH_MS,
  })

  // The three live attendance feeds (active entries, active breaks, pending approvals).
  const { attendanceData, activeBreaks, pendingApprovalsData } = useAttendanceFeeds(canReadAttendance, afterFirstLoad)

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
    queryKey: keys.locations.rosterBatch(locationIds),
    queryFn: () => locationsApi.getRosters(locationIds),
    enabled: locationIds.length > 0,
    staleTime: 60000,
  })
  const rosters: LocationAssignment[] = useMemo(() => rostersData || [], [rostersData])

  // Batched attendance for employees (admins use the org-wide query above), again
  // one request for all their spaces instead of one per space.
  const { data: batchAttendance } = useQuery({
    queryKey: keys.attendance.locationBatch(locKey, todayKey()),
    queryFn: () => attendanceApi.getEntriesBatch(locationIds, todayKey()),
    enabled: !canReadAttendance && locationIds.length > 0,
    staleTime: 30000,
  })

  // Today's presence entries: admins read org-wide; employees use the batch.
  const todayEntries: TimeEntry[] = useMemo(() => {
    if (canReadAttendance) return attendanceData?.data || []
    return batchAttendance || []
  }, [canReadAttendance, attendanceData, batchAttendance])

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

  const memberMap = useMemo(
    () => memberMapOf(members, presenceDirectory, rosters),
    [members, presenceDirectory, rosters],
  )

  // Per-user attendance facts, derived in ONE pass. Previously the same array
  // was copied and re-sorted three times to build three parallel maps keyed by
  // the same user and read from the same (most recent) entry.
  //
  // `clockedIn` is true when ANY of today's entries is open; the descriptive
  // fields come from the most recent entry, which is what the presence labels
  // describe. Identical results to the three maps it replaces.
  const { clockedInUserIds, attendanceByUser } = useMemo(() => attendanceFactsOf(todayEntries), [todayEntries])

  // locationId -> { is this space shift-based, does it have a real geofence }.
  const spaceMetaByLocation = useMemo(() => spaceMetaOf(allLocations), [allLocations])

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
  const activeTaskMap = useMemo(() => activeTaskMapOf(tasks), [tasks])

  // Active task per member as computed server-side on the roster. Employees can
  // only read their own tasks, so this is how their dashboard learns which
  // colleagues are currently working (presence parity with the admin view).
  const rosterActiveTaskMap = useMemo(() => rosterActiveTaskMapOf(rosters), [rosters])

  // Assignments per location: locationId -> userId[]
  const assignmentsPerLocation = useMemo(() => assignmentsPerLocationOf(locationIds, rosters), [locationIds, rosters])

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

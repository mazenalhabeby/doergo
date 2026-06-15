"use client"

import { useMemo, useCallback, useState } from "react"
import { useQuery, useQueries } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Users } from "lucide-react"

import { getSpaceScope } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import {
  tasksApi,
  locationsApi,
  attendanceApi,
  organizationsApi,
  type OrgMember,
  type LocationAssignment,
  type Task,
} from "@/lib/api"
import type { TimeEntry } from "@hbcfield/shared"
import { AssignMemberDialog } from "@/components/assign-member-dialog"
import { Button } from "@/components/ui/button"
import {
  WorkspaceGrid,
  ActivityPanel,
  RecentTasks,
  type RecentTask,
  type WorkspaceBoxProps,
  type PersonNodeProps,
  type WorkerStatus,
  type LiveEvent,
  type PendingAction,
} from "@/components/dashboard"
import { ActivityPanelToggle } from "@/components/activity-panel-toggle"
import { useActivityPanel } from "@/contexts/activity-panel-context"
import { getGreeting } from "./helpers"

// ── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "linear-gradient(135deg, #6366f1, #8b5cf6)",
  "linear-gradient(135deg, #3b82f6, #06b6d4)",
  "linear-gradient(135deg, #10b981, #059669)",
  "linear-gradient(135deg, #f59e0b, #d97706)",
  "linear-gradient(135deg, #ef4444, #dc2626)",
  "linear-gradient(135deg, #ec4899, #db2777)",
  "linear-gradient(135deg, #8b5cf6, #a855f7)",
  "linear-gradient(135deg, #14b8a6, #0d9488)",
]

function getInitials(firstName?: string, lastName?: string): string {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase()
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function getAvatarColor(id: string): string {
  return AVATAR_COLORS[hashString(id) % AVATAR_COLORS.length]!
}

/** Employee status based on ATTENDANCE (not task status) */
function getEmployeeStatus(opts: {
  isClockedIn: boolean
  isOnBreak: boolean
  isLate: boolean // clocked in late based on schedule
  hasActiveTask: boolean
}): { status: WorkerStatus; tag?: PersonNodeProps["tag"] } {
  if (!opts.isClockedIn) {
    return { status: "off" }
  }
  if (opts.isOnBreak) {
    return { status: "on", tag: { text: "On Break", variant: "hrs" } }
  }
  if (opts.isLate) {
    return { status: "late", tag: { text: "Late", variant: "late" } }
  }
  if (opts.hasActiveTask) {
    return { status: "busy", tag: { text: "Working", variant: "task" } }
  }
  return { status: "on", tag: { text: "Available", variant: "hrs" } }
}

/** Check if a time entry is "currently clocked in" (no clock-out yet) */
function isClockedIn(entry: TimeEntry): boolean {
  return entry.status === "CLOCKED_IN" && !entry.clockOutAt
}

/** Get today's date string in YYYY-MM-DD format */
function getTodayString(): string {
  return new Date().toISOString().split("T")[0]!
}

/** Build a PersonNodeProps from an OrgMember */
function memberToPersonNode(
  member: OrgMember,
  status: WorkerStatus,
  tag?: PersonNodeProps["tag"],
  currentTask?: string,
): PersonNodeProps {
  return {
    initials: getInitials(member.firstName, member.lastName),
    color: getAvatarColor(member.id),
    status,
    imageUrl: member.avatarUrl || undefined,
    name: `${member.firstName} ${member.lastName?.[0] || ""}.`,
    tag,
    userId: member.id,
    role: member.role === "EMPLOYEE" ? "Employee" : member.role === "MANAGER" ? "Manager" : "Admin",
    currentTask,
  }
}

/** Map a Task to the compact RecentTask shape used by the dashboard list. */
function toRecentTask(tk: Task): RecentTask {
  return {
    id: tk.id,
    title: tk.title,
    status: tk.status,
    priority: tk.priority || "MEDIUM",
    dueDate: tk.dueDate ? new Date(tk.dueDate) : undefined,
    location: tk.locationAddress || undefined,
    createdAt: new Date(tk.updatedAt || Date.now()),
  }
}

/** Time elapsed since a date, human readable */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Component ────────────────────────────────────────────────────────────────

export function ClientDashboard() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const router = useRouter()
  const { isOpen: panelOpen } = useActivityPanel()

  const handleEditLocation = useCallback((locationId: string) => {
    router.push(`/locations?edit=${locationId}`)
  }, [router])

  const [assignSpaceId, setAssignSpaceId] = useState<string | null>(null)
  const handleNavigateToProfile = useCallback((userId: string) => {
    router.push(`/members/${userId}`)
  }, [router])

  const handleAssignWorkers = useCallback((locationId: string) => {
    setAssignSpaceId(locationId)
  }, [])

  const handleViewTasks = useCallback((locationId: string) => {
    router.push(`/tasks?space=${locationId}`)
  }, [router])

  // ── Data Fetching ──────────────────────────────────────────────────────────

  // Tasks — auto-refresh every 30s for live updates
  const { data: tasksData, isLoading: loadingTasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => tasksApi.list({ limit: 200 }),
  })

  // Company locations
  const { data: locationsData, isLoading: loadingLocations } = useQuery({
    queryKey: ["locations"],
    queryFn: () => locationsApi.list(),
  })

  // All org members (for worker info: name, avatar, workMode, role)
  const { data: membersData } = useQuery({
    queryKey: ["orgMembers-dashboard"],
    queryFn: () => organizationsApi.getMembers({ limit: 200 }),
    staleTime: 60000,
  })

  // Attendance entries for today — who is clocked in?
  const { data: attendanceData } = useQuery({
    queryKey: ["attendance-today"],
    queryFn: () => attendanceApi.getAllEntries({ date: getTodayString(), limit: 500 }),
    staleTime: 30000,
  })

  // Active breaks — who is currently on break?
  const { data: activeBreaksData } = useQuery({
    queryKey: ["active-breaks"],
    queryFn: () => attendanceApi.getActiveBreaks().catch(() => ({ data: [] })),
    staleTime: 30000,
  })

  // ── Derived Data ───────────────────────────────────────────────────────────

  const tasks: Task[] = tasksData?.data || []
  const allLocations = locationsData?.data || []
  const members: OrgMember[] = membersData?.data || []
  const todayEntries: TimeEntry[] = attendanceData?.data || []
  const activeBreaks = (activeBreaksData as any)?.data || []

  // Set of user IDs currently on break
  const onBreakUserIds = useMemo(() => {
    const set = new Set<string>()
    for (const b of activeBreaks) {
      if (b.userId) set.add(b.userId)
    }
    return set
  }, [activeBreaks])

  // Location assignments — fetch per location
  const locationIds = useMemo(
    () => allLocations.filter((l: { isActive: boolean }) => l.isActive).map((l: { id: string }) => l.id),
    [allLocations],
  )

  const assignmentQueries = useQueries({
    queries: locationIds.map((locId: string) => ({
      queryKey: ["locationAssignments", locId],
      queryFn: () => locationsApi.getAssignedMembers(locId).catch(() => [] as LocationAssignment[]),
      staleTime: 60000,
    })),
  })

  // Stable key derived from query results (avoids useMemo size changes)
  const assignmentDataKey = assignmentQueries.map(q => q.dataUpdatedAt).join(",")

  // Build the member lookup. Admins/managers get the full org member list; for
  // employees (who can't read /organizations/members) we fall back to the user
  // details embedded in the scoped location rosters — so their space still
  // shows real names/avatars without exposing the whole directory.
  const memberMap = useMemo(() => {
    const map = new Map<string, OrgMember>()
    for (const q of assignmentQueries) {
      const data = q.data as LocationAssignment[] | undefined
      if (!data) continue
      for (const a of data) {
        if (a.user && !map.has(a.user.id)) {
          map.set(a.user.id, { ...a.user, isActive: true, role: "EMPLOYEE" } as unknown as OrgMember)
        }
      }
    }
    // Full member records take precedence (richer data) when available.
    for (const m of members) map.set(m.id, m)
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, assignmentDataKey])

  // Set of user IDs currently clocked in (active today, no clock-out)
  const clockedInUserIds = useMemo(() => {
    const set = new Set<string>()
    for (const entry of todayEntries) {
      if (isClockedIn(entry)) set.add(entry.userId)
    }
    return set
  }, [todayEntries])

  // Map userId -> locationId from today's attendance (most recent clock-in location)
  const attendanceLocationMap = useMemo(() => {
    const map = new Map<string, string>()
    // Sort by clockInAt descending so we get the most recent
    const sorted = [...todayEntries].sort(
      (a, b) => new Date(b.clockInAt).getTime() - new Date(a.clockInAt).getTime(),
    )
    for (const entry of sorted) {
      if (!map.has(entry.userId)) {
        map.set(entry.userId, entry.locationId)
      }
    }
    return map
  }, [todayEntries])

  // Map userId -> active task (highest priority: IN_PROGRESS > EN_ROUTE > ARRIVED > BLOCKED)
  const activeTaskMap = useMemo(() => {
    const map = new Map<string, Task>()
    const priority: Record<string, number> = {
      IN_PROGRESS: 4,
      ARRIVED: 3,
      EN_ROUTE: 2,
      BLOCKED: 1,
    }
    for (const task of tasks) {
      const assigneeId = task.assignedToId
      if (!assigneeId) continue
      const p = priority[task.status]
      if (p === undefined) continue
      const existing = map.get(assigneeId)
      if (!existing || (priority[existing.status] || 0) < p) {
        map.set(assigneeId, task)
      }
    }
    return map
  }, [tasks])

  // Assignments per location: locationId -> userId[]
  const assignmentsPerLocation = useMemo(() => {
    const map = new Map<string, Set<string>>()
    locationIds.forEach((locId: string, i: number) => {
      const data = assignmentQueries[i]?.data as LocationAssignment[] | undefined
      const userIds = new Set<string>()
      if (data) {
        for (const a of data) userIds.add(a.userId)
      }
      map.set(locId, userIds)
    })
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationIds, assignmentDataKey])

  // ── Loading ────────────────────────────────────────────────────────────────

  const isDataLoading = loadingTasks || loadingLocations

  // Role-based + Access-Profile space-scope filtering.
  //   admin/manager → all spaces
  //   scope 'tasks' → NO spaces (tasks-only landing)
  //   scope 'all'   → read-only overview of every space
  //   scope 'own'   → only the spaces they're a roster member of (or assigned a task in)
  const isAdminOrDispatcher = user?.role === "ADMIN" || user?.role === "MANAGER"
  const spaceScope = getSpaceScope(user ?? {})
  const locations = useMemo(() => {
    if (isAdminOrDispatcher) return allLocations
    if (spaceScope === "tasks") return []
    if (spaceScope === "all") return allLocations
    // 'own' — spaces where the user is on the roster, plus any space a task of
    // theirs lives in (covers ad-hoc assignments without a roster entry).
    const userSpaceIds = new Set<string>()
    for (const [locId, ids] of assignmentsPerLocation) {
      if (user?.id && ids.has(user.id)) userSpaceIds.add(locId)
    }
    for (const task of tasks) {
      if (task.assignedToId === user?.id && task.spaceId) userSpaceIds.add(task.spaceId)
    }
    if (userSpaceIds.size === 0) return []
    return allLocations.filter((loc: { id: string }) => userSpaceIds.has(loc.id))
  }, [isAdminOrDispatcher, spaceScope, allLocations, tasks, user?.id, assignmentsPerLocation])

  // ── Build Workspace Boxes ─────────────────────────────────────────────────

  const workspaceBoxes: WorkspaceBoxProps[] = useMemo(() => {
    const boxes: WorkspaceBoxProps[] = []

    // Track which worker IDs are accounted for (placed in a location box)
    const accountedWorkerIds = new Set<string>()

    // Compute alerts per location
    const now = new Date()

    for (const loc of locations) {
      if (!loc.isActive) continue

      const locId = loc.id
      const assignedUserIds = assignmentsPerLocation.get(locId) || new Set<string>()

      const people: PersonNodeProps[] = []
      const offDutyPeople: PersonNodeProps[] = []
      const onRoadPeople: PersonNodeProps[] = []
      const remotePeople: PersonNodeProps[] = []

      for (const userId of assignedUserIds) {
        const member = memberMap.get(userId)
        if (!member) continue
        if (!member.isActive) continue

        accountedWorkerIds.add(userId)

        const activeTask = activeTaskMap.get(userId)
        const isCurrentlyClockedIn = clockedInUserIds.has(userId)
        const clockedInLocationId = attendanceLocationMap.get(userId)
        const workMode = member.workMode || "HYBRID"

        // Determine employee status based on ATTENDANCE (not task)
        const hasActiveTask = !!activeTask
        const isOnBreak = onBreakUserIds.has(userId)

        const { status, tag } = getEmployeeStatus({
          isClockedIn: isCurrentlyClockedIn,
          isOnBreak,
          isLate: false, // TODO: compare clock-in time vs schedule
          hasActiveTask,
        })

        const node = memberToPersonNode(member, status, tag, activeTask?.title)

        if (!isCurrentlyClockedIn && !hasActiveTask) {
          // Not clocked in, no task → off duty
          offDutyPeople.push(memberToPersonNode(member, "off"))
        } else if (workMode === "ON_ROAD") {
          // On-road workers go in field sub-panel
          onRoadPeople.push({ ...node, tag: tag || { text: "In Field", variant: "task" } })
        } else if (isCurrentlyClockedIn && clockedInLocationId !== locId) {
          // Clocked in at a different location → remote
          remotePeople.push({ ...node, tag: tag || { text: "Off-site", variant: "hrs" } })
        } else {
          // Present at this location (clocked in here, or has task here)
          people.push(node)
        }
      }

      // Count alerts (BLOCKED + overdue tasks at this location)
      let locAlerts = 0
      for (const task of tasks) {
        const isThisLocation = task.spaceId === locId || task.locationAddress?.includes(loc.name)
        if (!isThisLocation) continue
        const isBlocked = task.status === "BLOCKED"
        const isOverdue = task.dueDate && new Date(task.dueDate) < now &&
          !["COMPLETED", "CLOSED", "CANCELED"].includes(task.status)
        if (isBlocked || isOverdue) locAlerts++
      }

      const activeCount = people.length + onRoadPeople.length + remotePeople.length

      boxes.push({
        title: loc.name,
        type: "fixed",
        people,
        offDutyPeople,
        onRoadPeople,
        remotePeople,
        totalAssigned: assignedUserIds.size,
        activeCount,
        locationId: locId,
        alerts: locAlerts,
        // Manage/assign are admin-only; employees get a read-only space view.
        onEdit: isAdminOrDispatcher ? handleEditLocation : undefined,
        onAssign: isAdminOrDispatcher ? handleAssignWorkers : undefined,
        onViewTasks: handleViewTasks,
        onPersonClick: handleNavigateToProfile,
      })
    }

    // "On Task" dynamic box — workers with active tasks NOT assigned to any location
    const onTaskPeople: PersonNodeProps[] = []
    for (const [userId, task] of activeTaskMap) {
      if (accountedWorkerIds.has(userId)) continue
      const member = memberMap.get(userId)
      if (!member) {
        // Fallback to task.assignedTo data if member not found
        if (task.assignedTo) {
          const fallbackStatus = getEmployeeStatus({
            isClockedIn: clockedInUserIds.has(task.assignedTo.id),
            isOnBreak: onBreakUserIds.has(task.assignedTo.id),
            isLate: false,
            hasActiveTask: true,
          })
          onTaskPeople.push({
            initials: getInitials(task.assignedTo.firstName, task.assignedTo.lastName),
            color: getAvatarColor(task.assignedTo.id),
            status: fallbackStatus.status,
            imageUrl: task.assignedTo.avatarUrl || undefined,
            name: `${task.assignedTo.firstName} ${task.assignedTo.lastName?.[0] || ""}.`,
            tag: fallbackStatus.tag,
            userId: task.assignedTo.id,
            role: "Employee",
            currentTask: task.title,
          })
        }
        continue
      }
      accountedWorkerIds.add(userId)
      const isClockedIn = clockedInUserIds.has(userId)
      const { status, tag } = getEmployeeStatus({
        isClockedIn,
        isOnBreak: onBreakUserIds.has(userId),
        isLate: false,
        hasActiveTask: true,
      })
      onTaskPeople.push(memberToPersonNode(member, status, tag, task.title))
    }

    if (onTaskPeople.length > 0) {
      boxes.push({
        title: "On Task",
        type: "dynamic",
        people: onTaskPeople,
        onPersonClick: handleNavigateToProfile,
      })
    }

    // "Off Duty" dynamic box — workers who are clocked out and not assigned to any location
    const offDutyPeople: PersonNodeProps[] = []
    const workers = members.filter(m => m.role === "EMPLOYEE" && m.isActive)
    for (const worker of workers) {
      if (accountedWorkerIds.has(worker.id)) continue
      if (!clockedInUserIds.has(worker.id) && !activeTaskMap.has(worker.id)) {
        accountedWorkerIds.add(worker.id)
        offDutyPeople.push(memberToPersonNode(worker, "off"))
      }
    }

    if (offDutyPeople.length > 0) {
      boxes.push({
        title: "Off Duty",
        type: "dynamic",
        people: offDutyPeople,
        onPersonClick: handleNavigateToProfile,
      })
    }

    return boxes
  }, [
    locations, tasks, members, assignmentsPerLocation,
    memberMap, clockedInUserIds, onBreakUserIds, attendanceLocationMap, activeTaskMap,
    handleEditLocation, handleAssignWorkers, handleViewTasks, handleNavigateToProfile,
    isAdminOrDispatcher,
  ])

  // ── Live Events ────────────────────────────────────────────────────────────

  const liveEvents: LiveEvent[] = useMemo(() => {
    const events: LiveEvent[] = []

    // Recent task activity (sorted by updatedAt descending)
    const sortedTasks = [...tasks]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10)

    const dotMap: Record<string, LiveEvent["dot"]> = {
      IN_PROGRESS: "green",
      EN_ROUTE: "blue",
      ARRIVED: "green",
      COMPLETED: "blue",
      BLOCKED: "red",
      ASSIGNED: "amber",
      ACCEPTED: "green",
      NEW: "purple",
      CANCELED: "red",
    }
    const actionMap: Record<string, string> = {
      IN_PROGRESS: "started working on",
      EN_ROUTE: "en route to",
      ARRIVED: "arrived at",
      COMPLETED: "completed",
      BLOCKED: "blocked on",
      ASSIGNED: "was assigned to",
      ACCEPTED: "accepted",
      NEW: "created",
      CANCELED: "canceled",
    }

    for (const task of sortedTasks) {
      const assignee = task.assignedTo
      const name = assignee
        ? `${assignee.firstName} ${assignee.lastName?.[0] || ""}.`
        : "Someone"
      const action = actionMap[task.status] || "updated"

      events.push({
        id: `task-${task.id}`,
        dot: dotMap[task.status] || "blue",
        message: (
          <>
            <strong>{name}</strong> {action} <strong>{task.title}</strong>
          </>
        ),
        time: timeAgo(task.updatedAt),
      })
    }

    // Recent attendance events (clock-ins from today)
    const recentClockIns = [...todayEntries]
      .sort((a, b) => new Date(b.clockInAt).getTime() - new Date(a.clockInAt).getTime())
      .slice(0, 5)

    for (const entry of recentClockIns) {
      const member = memberMap.get(entry.userId)
      const name = member
        ? `${member.firstName} ${member.lastName?.[0] || ""}.`
        : entry.user
          ? `${entry.user.firstName} ${entry.user.lastName?.[0] || ""}.`
          : "Someone"
      const locationName = entry.location?.name || "a location"

      if (isClockedIn(entry)) {
        events.push({
          id: `clock-in-${entry.id}`,
          dot: "green",
          message: (
            <>
              <strong>{name}</strong> clocked in at <strong>{locationName}</strong>
            </>
          ),
          time: timeAgo(entry.clockInAt),
        })
      } else if (entry.clockOutAt) {
        events.push({
          id: `clock-out-${entry.id}`,
          dot: "blue",
          message: (
            <>
              <strong>{name}</strong> clocked out from <strong>{locationName}</strong>
            </>
          ),
          time: timeAgo(entry.clockOutAt),
        })
      }
    }

    // Sort all events by time (most recent first) and take top 12
    return events.slice(0, 12)
  }, [tasks, todayEntries, memberMap])

  // ── Pending Actions ────────────────────────────────────────────────────────

  const pendingActions: PendingAction[] = useMemo(() => {
    const actions: PendingAction[] = []

    // Blocked tasks need attention
    const blockedTasks = tasks.filter(t => t.status === "BLOCKED")
    for (const task of blockedTasks.slice(0, 3)) {
      const assignee = task.assignedTo
      const name = assignee
        ? `${assignee.firstName} ${assignee.lastName?.[0] || ""}.`
        : "Unassigned"
      const initials = assignee
        ? getInitials(assignee.firstName, assignee.lastName)
        : "?"

      actions.push({
        id: `blocked-${task.id}`,
        initials,
        color: getAvatarColor(assignee?.id || "x"),
        imageUrl: assignee?.avatarUrl || undefined,
        title: `${name} - Blocked`,
        description: task.title,
        onApprove: () => router.push(`/tasks/${task.id}`),
        onReject: () => {},
      })
    }

    // New unassigned tasks need assignment
    const newTasks = tasks.filter(t => t.status === "NEW" && !t.assignedToId)
    for (const task of newTasks.slice(0, 3)) {
      actions.push({
        id: `new-${task.id}`,
        initials: "?",
        color: AVATAR_COLORS[4]!,
        title: "Unassigned - New Task",
        description: task.title,
        onApprove: () => router.push(`/tasks/${task.id}`),
      })
    }

    return actions.slice(0, 5)
  }, [tasks, router])

  // ── Render ─────────────────────────────────────────────────────────────────

  const greeting = getGreeting()

  // Show nothing while data is still loading — prevents empty state flash
  if (isDataLoading) {
    return null // layout's Suspense fallback handles the skeleton
  }

  const hasFixedLocations = workspaceBoxes.some(b => b.type === "fixed")

  // Empty state — no fixed locations to show
  if (!hasFixedLocations) {
    // Employees with no space view (tasks-only scope, or unassigned) get a
    // compact task-focused landing — NOT the admin "set up workspace" screen.
    if (!isAdminOrDispatcher) {
      const myTasks = tasks.filter((tk) => tk.assignedToId === user?.id).slice(0, 6)
      return (
        <div className="mx-auto max-w-2xl px-6 py-8">
          <p className="text-[13px] font-medium text-muted-foreground">{greeting}</p>
          <h1 className="text-2xl font-semibold text-foreground mb-6">
            {t("dashboard.admin.welcomeBack", { name: user?.firstName })}
          </h1>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">My tasks</h2>
            <Link href="/tasks" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-2">
            <RecentTasks tasks={myTasks.map(toRecentTask)} showViewAll={false} />
          </div>
        </div>
      )
    }
    return (
      <div className="flex flex-1 items-center justify-center relative overflow-hidden min-h-[calc(100vh-4rem)]">
        {/* Layer 1: Gradient blobs */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.07]">
          {[
            { w:500, h:500, bg:'#3b82f6', x:'-5%', y:'-10%', anim:'tileFloat1', dur:'18s', blur:120 },
            { w:450, h:450, bg:'#8b5cf6', x:'50%', y:'50%',  anim:'tileFloat3', dur:'20s', blur:120 },
            { w:400, h:400, bg:'#10b981', x:'60%', y:'-5%',  anim:'tileFloat2', dur:'22s', blur:100 },
          ].map((blob, i) => (
            <div key={i} className="absolute rounded-full" style={{ width:blob.w, height:blob.h, background:blob.bg, left:blob.x, top:blob.y, filter:`blur(${blob.blur}px)`, animation:`${blob.anim} ${blob.dur} ease-in-out infinite` }} />
          ))}
        </div>

        {/* Layer 2: Popup workspace boxes with connection lines */}
        <div className="absolute inset-0 pointer-events-none">
          {(() => {
            const boxes = [
              { w:130, h:90, delay:'0.3s', avatars:[
                { color:'#10b981', in:4, out:12, dur:16 },
                { color:'#3b82f6', in:6, out:14, dur:18 },
              ]},
              { w:140, h:90, delay:'0.7s', avatars:[
                { color:'#8b5cf6', in:3, out:11, dur:15 },
                { color:'#f59e0b', in:7, out:13, dur:17 },
                { color:'#10b981', in:9, out:16, dur:19 },
              ]},
              { w:120, h:90, delay:'1.1s', avatars:[
                { color:'#3b82f6', in:5, out:10, dur:14 },
              ]},
              { w:130, h:90, delay:'1.5s', avatars:[
                { color:'#ec4899', in:4, out:9,  dur:13 },
                { color:'#06b6d4', in:8, out:15, dur:18 },
              ]},
              { w:140, h:90, delay:'1.9s', avatars:[
                { color:'#f59e0b', in:3, out:8,  dur:12 },
                { color:'#8b5cf6', in:6, out:11, dur:14 },
                { color:'#ef4444', in:10, out:16, dur:17 },
              ]},
              { w:120, h:90, delay:'2.3s', avatars:[
                { color:'#06b6d4', in:5, out:13, dur:16 },
              ]},
            ]
            const count = boxes.length
            const radius = 42
            return boxes.map((box, i) => {
              const angle = (i * 360 / count) - 90
              const rad = (angle * Math.PI) / 180
              const cx = 50 + radius * Math.cos(rad)
              const cy = 50 + radius * Math.sin(rad)
              return { ...box, x: `${cx}%`, y: `${cy}%`, angle }
            })
          })().map((box, i) => (
            <div
              key={i}
              className="absolute rounded-2xl border border-foreground/[0.06] bg-card/50 backdrop-blur-md -translate-x-1/2 -translate-y-1/2 shadow-lg shadow-black/10"
              style={{
                left: box.x,
                top: box.y,
                width: box.w,
                height: box.h,
                animation: `boxPopIn 0.6s cubic-bezier(0.34,1.56,0.64,1) ${box.delay} both`,
              }}
            >
              <div className="flex items-center gap-1.5 px-3 pt-2.5">
                <div className="h-1.5 w-12 rounded-full bg-foreground/[0.08]" />
                <div className="h-1.5 w-5 rounded-full bg-foreground/[0.05] ml-auto" />
              </div>
              <div className="flex items-center justify-center gap-2 pt-3 pb-2">
                {box.avatars.map((av, j) => (
                  <div
                    key={j}
                    className="w-7 h-7 rounded-full"
                    style={{
                      background: av.color,
                      boxShadow: `0 0 10px ${av.color}25`,
                      animation: `avatarClockIn ${av.dur}s ease-in-out ${av.in}s infinite`,
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center justify-center gap-3 px-3 pb-2">
                {box.avatars.map((_, j) => (
                  <div key={j} className="h-1 w-6 rounded-full bg-foreground/[0.05]" />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Content — admins get the setup CTA; everyone else a neutral message */}
        <div className="relative text-center max-w-md space-y-10 z-10 px-6">
          {isAdminOrDispatcher ? (
            <>
              <div className="space-y-4">
                <h1 className="text-4xl font-bold tracking-tight leading-tight bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
                  Set up your<br />workspace
                </h1>
                <p className="text-muted-foreground text-base leading-relaxed max-w-sm mx-auto">
                  Create spaces, add your team, and track everyone in real time — all from one view.
                </p>
              </div>

              <div className="flex items-center justify-center gap-3">
                <Button asChild size="lg" className="gap-2 h-12 px-6 text-sm shadow-lg shadow-primary/25">
                  <Link href="/locations">
                    <Plus className="h-4 w-4" />
                    Add Space
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="gap-2 h-12 px-6 text-sm">
                  <Link href="/members">
                    <Users className="h-4 w-4" />
                    Invite Team
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                No spaces assigned yet
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
                You haven&apos;t been added to a space. Check the Tasks tab for your assigned work, or ask your manager to add you.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Employees with spaces get a 2-column layout: their (read-only) spaces on the
  // left, their own tasks always on the right. Admins/managers keep the live
  // Activity panel. Tasks are ALWAYS present for employees (here, or full-width
  // in the no-spaces landing above).
  if (!isAdminOrDispatcher) {
    const myTasks = tasks.filter((tk) => tk.assignedToId === user?.id)
    return (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          <div className="px-6 pt-6">
            <p className="text-[13px] font-medium text-muted-foreground">{greeting}</p>
            <h1 className="text-2xl font-semibold text-foreground">
              {t("dashboard.admin.welcomeBack", { name: user?.firstName })}
            </h1>
          </div>
          <div className="max-w-[1440px] mx-auto px-6 py-6">
            <WorkspaceGrid boxes={workspaceBoxes} />
          </div>
        </div>

        {/* My Tasks — always present for employees */}
        <aside className="hidden lg:flex w-[340px] shrink-0 flex-col border-l border-border h-full overflow-y-auto bg-card/30">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">My Tasks</h2>
            <Link href="/tasks" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          <div className="px-3 py-2">
            <RecentTasks tasks={myTasks.slice(0, 15).map(toRecentTask)} showViewAll={false} />
          </div>
        </aside>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      {/* Main content — scrollable */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6">
          <div style={{ paddingLeft: "max(0px, calc((100% - 1440px) / 2))" }}>
            <p className="text-[13px] font-medium text-muted-foreground">{greeting}</p>
            <h1 className="text-2xl font-semibold text-foreground">
              {t("dashboard.admin.welcomeBack", { name: user?.firstName })}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdminOrDispatcher && (
              <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
                <Link href="/locations">
                  <Plus className="h-3.5 w-3.5" />
                  New Space
                </Link>
              </Button>
            )}
            <ActivityPanelToggle />
          </div>
        </div>

        {/* Workspace Grid — contained */}
        <div className="max-w-[1440px] mx-auto px-6 py-6">
          <WorkspaceGrid boxes={workspaceBoxes} />
        </div>
      </div>

      {/* Right Activity Panel — flex sibling, full height */}
      <ActivityPanel events={liveEvents} pending={pendingActions} className="h-full" />

      {/* Assign member dialog — opens from workspace box "Add Member" button */}
      <AssignMemberDialog
        open={!!assignSpaceId}
        onOpenChange={(open) => { if (!open) setAssignSpaceId(null) }}
        taskId={null}
        spaceId={assignSpaceId}
        onAssign={() => {}}
      />

    </div>
  )
}

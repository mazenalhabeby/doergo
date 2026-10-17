import type { TimeEntry } from "@hbcfield/shared"
import { isWorkPresence, presenceFreshness } from "@hbcfield/shared/client"
import type { LocationAssignment, OrgMember, Task } from "@/lib/api"
import { assigneeIds } from "@/lib/task-assignment"

import { isClockedIn } from "../_components/helpers"
import type { AttendanceFacts } from "./build-workspace-boxes"

/**
 * The dashboard's derived maps — the bodies of useDashboardData's memos, moved here
 * unchanged. The hook still memoises each one, with the same dependencies, in the same order.
 */

/** Who each id is: roster users, then attendance-derived records, then the real directory (fullest wins). */
export function memberMapOf(members: OrgMember[], presenceDirectory: OrgMember[], rosters: LocationAssignment[]) {
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
}

/** Per-user attendance facts in one pass over today's entries (see useDashboardData). */
export function attendanceFactsOf(todayEntries: TimeEntry[]) {
  const clocked = new Set<string>()
  const facts = new Map<string, AttendanceFacts>()

  // Newest first, so the first entry seen per user IS their most recent.
  const byRecency = [...todayEntries].sort((a, b) => new Date(b.clockInAt).getTime() - new Date(a.clockInAt).getTime())

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
        workPresence: isWorkPresence(entry.presence) ? entry.presence : null,
        freshness: isClockedIn(entry)
          ? presenceFreshness({ clockInAt: entry.clockInAt, lastSeenAt: entry.lastSeenAt, now: new Date() })
          : undefined,
        lastSeenAt: entry.lastSeenAt ?? null,
      })
    }
  }

  return { clockedInUserIds: clocked, attendanceByUser: facts }
}

/** locationId -> is this space shift-based, does it have a real geofence. */
export function spaceMetaOf(allLocations: unknown[]) {
  const map = new Map<string, { isShiftBased: boolean; hasLocation: boolean }>()
  for (const l of allLocations as Array<{ id: string; workModel?: string; lat?: number | null; lng?: number | null }>) {
    const wm = l.workModel || "NONE"
    map.set(l.id, {
      isShiftBased: wm === "SHIFT" || wm === "FIXED",
      hasLocation: l.lat != null && l.lng != null,
    })
  }
  return map
}

/** userId -> the task they are actively on (IN_PROGRESS > ARRIVED > EN_ROUTE > BLOCKED), for every assignee. */
export function activeTaskMapOf(tasks: Task[]) {
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
}

/** userId -> the current task the server put on their roster row. */
export function rosterActiveTaskMapOf(rosters: LocationAssignment[]) {
  const map = new Map<string, { title: string; status: string }>()
  for (const a of rosters) {
    if (a.currentTask) {
      map.set(a.userId, { title: a.currentTask, status: a.currentTaskStatus || "IN_PROGRESS" })
    }
  }
  return map
}

/** locationId -> the ids of the people rostered there (every visible space present, even empty). */
export function assignmentsPerLocationOf(locationIds: string[], rosters: LocationAssignment[]) {
  const map = new Map<string, Set<string>>()
  for (const locId of locationIds) map.set(locId, new Set<string>())
  for (const a of rosters) {
    if (!map.has(a.locationId)) map.set(a.locationId, new Set<string>())
    map.get(a.locationId)!.add(a.userId)
  }
  return map
}

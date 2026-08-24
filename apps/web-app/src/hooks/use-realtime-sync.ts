"use client"

import { useEffect, useCallback, useRef } from "react"
import type { TaskEventPayload } from "@/types/socket-events"
import { useQueryClient } from "@tanstack/react-query"
import { useSocketContext } from "@/contexts/socket-context"
import { useAuth } from "@/contexts/auth-context"

/**
 * Central real-time sync hook.
 *
 * ONE hook, wired ONCE in the dashboard layout.
 * Listens to ALL Socket.IO events and updates React Query cache globally.
 * Every page (dashboard, tasks, team, attendance) reads from the same cache.
 *
 * Events handled:
 * - Task: created, updated, assigned, statusChanged, commentAdded, attachmentAdded
 * - Attendance: clockIn, clockOut, breakStarted, breakEnded
 * - Worker: locationUpdated
 * - Member: updated (future)
 * - Message: received (future)
 * - Call: incoming (future)
 */

// All Socket.IO event names — single source of truth
const Events = {
  // Tasks
  TASK_CREATED: "task.created",
  TASK_UPDATED: "task.updated",
  TASK_ASSIGNED: "task.assigned",
  TASK_STATUS_CHANGED: "task.statusChanged",
  TASK_COMMENT_ADDED: "task.commentAdded",
  TASK_ATTACHMENT_ADDED: "task.attachmentAdded",
  TASK_DECLINED: "task.declined",
  TASK_DELETED: "task.deleted",
  // Attendance
  CLOCK_IN: "attendance.clockIn",
  CLOCK_OUT: "attendance.clockOut",
  BREAK_STARTED: "break.started",
  BREAK_ENDED: "break.ended",
  // Admin-side attendance mutation (edit/approve/reject/delete/manual-add)
  ATTENDANCE_CHANGED: "attendance.changed",
  // Availability status (Available/Busy/Away)
  PRESENCE_CHANGED: "presence.changed",
  // Geofence excursion ("out of ring") — emitted to the org room by name
  EXCURSION_OUT: "geofence_excursion_out",
  EXCURSION_REQUESTED: "geofence_excursion_requested",
  EXCURSION_APPROVED: "geofence_excursion_approved",
  EXCURSION_REJECTED: "geofence_excursion_rejected",
  EXCURSION_RETURNED: "geofence_excursion_returned",
  EXCURSION_EXPIRED: "geofence_excursion_expired",
  // Members / access
  MEMBER_CHANGED: "member.changed",
  MEMBER_ACCESS_UPDATED: "member.access_updated",
  // A new join request arrived (emitted to the org + the routed approvers)
  JOIN_REQUEST_SUBMITTED: "join_request_submitted",
  // Shift-reminder / no-show engine. These are push-first on mobile; on the web
  // they are the only signal the attendance board gets.
  NOSHOW_REMINDER: "attendance_noshow_reminder",
  NOSHOW_ESCALATION: "attendance_noshow_escalation",
  SHIFT_REMINDER: "attendance_shift_reminder",
  SHIFT_ESCALATION: "attendance_shift_escalation",
  // Spaces
  SPACE_CHANGED: "space.changed",
  SPACE_ROSTER_CHANGED: "space.rosterChanged",
  // Tracking
  WORKER_LOCATION: "worker.locationUpdated",
  // Future: messaging, calls
  MESSAGE_RECEIVED: "message.received",
  CALL_INCOMING: "call.incoming",
} as const

// The /attendance PAGE query keys (Time → tracking / approvals / breaks / no-shows
// / days-off / availability). Distinct from the DASHBOARD keys below — both must
// refresh on a clock or an admin edit, so keep this list as the single source and
// spread it into every attendance-affecting event (DRY).
const ATTENDANCE_PAGE_KEYS: string[][] = [
  ["attendance"], // main tracking list — ["attendance", loc, status, ...] (prefix match)
  ["attendance-approvals"],
  ["attendance-breaks-active"],
  ["attendance-breaks-history"],
  ["attendance-breaks-summary"],
  ["attendance-no-shows"],
  ["geofence-excursions"],
  ["orgTimeOff"],
  ["availability"],
]

// The DASHBOARD attendance keys (presence tiles + per-location batch + approvals).
const DASHBOARD_ATTENDANCE_KEYS: string[][] = [
  ["attendance-active"],
  ["locationAttendanceBatch"],
  ["pending-approvals"],
  ["active-breaks"],
  ["orgMembers", "dashboard"],
]

// Everything that must refresh when attendance changes (clock or admin edit).
const ALL_ATTENDANCE_KEYS: string[][] = [...DASHBOARD_ATTENDANCE_KEYS, ...ATTENDANCE_PAGE_KEYS]

// Everywhere a member, an invitation or a join request is rendered. One list, so
// the four server call sites that emit `member.changed` cannot drift from what the
// screens actually read (DRY).
const MEMBER_KEYS: string[][] = [
  ["orgMembers"],              // /members list — ["orgMembers", search, role, page]
  ["orgMember"],               // /members/[id] detail
  ["orgContacts"],             // chat / contact directory
  ["pendingInvitations"],      // pending invites shown on /members
  ["invitations"],             // /invitations page
  ["join-requests"],           // /join-requests page
  ["all-location-assignments"],// member → spaces map on /members
  ["locationRosters"],         // space rosters
  ["orgMembers", "dashboard"], // dashboard roster tiles
]

// Query keys that each event should invalidate
const EVENT_INVALIDATIONS: Record<string, string[][]> = {
  // Task events → invalidate task lists, counts, and related
  [Events.TASK_CREATED]: [["tasks"], ["taskStatusCounts"]],
  [Events.TASK_UPDATED]: [["tasks"], ["taskStatusCounts"]],
  [Events.TASK_ASSIGNED]: [["tasks"], ["taskStatusCounts"]],
  [Events.TASK_STATUS_CHANGED]: [["tasks"], ["taskStatusCounts"], ["attendance-active"], ["locationAttendanceBatch"]],
  [Events.TASK_COMMENT_ADDED]: [["tasks"]],
  [Events.TASK_ATTACHMENT_ADDED]: [["tasks"]],
  [Events.TASK_DECLINED]: [["tasks"], ["taskStatusCounts"]],
  [Events.TASK_DELETED]: [["tasks"], ["taskStatusCounts"]],

  // Attendance events → invalidate the REAL dashboard attendance queries so a
  // clock-in/out live-updates the presence labels without a manual refresh.
  // (`attendance-today` was a phantom key that matched no query — the reason
  // the dashboard used to need refreshing.) `locationAttendanceBatch` is a
  // prefix — invalidateQueries matches ["locationAttendanceBatch", locKey, date].
  // Worker clock/break AND admin edits refresh BOTH the dashboard and the
  // attendance page (previously only the dashboard keys were invalidated, so the
  // /attendance tabs needed a manual reload).
  [Events.CLOCK_IN]: ALL_ATTENDANCE_KEYS,
  [Events.CLOCK_OUT]: ALL_ATTENDANCE_KEYS,
  [Events.BREAK_STARTED]: ALL_ATTENDANCE_KEYS,
  [Events.BREAK_ENDED]: ALL_ATTENDANCE_KEYS,
  [Events.ATTENDANCE_CHANGED]: ALL_ATTENDANCE_KEYS,

  // Availability change → refresh the dashboard roster + contacts (their dot updates)
  [Events.PRESENCE_CHANGED]: [["orgMembers", "dashboard"], ["orgContacts"]],

  // Geofence excursion → refresh the approver panel (["geofence-excursions"]).
  // out/reported/returned change the pending list; approved/rejected/expired also
  // touch clock state (reject clocks out) so refresh the dashboard attendance too.
  [Events.EXCURSION_OUT]: [["geofence-excursions"]],
  [Events.EXCURSION_REQUESTED]: [["geofence-excursions"]],
  [Events.EXCURSION_APPROVED]: [["geofence-excursions"]],
  [Events.EXCURSION_REJECTED]: [...ALL_ATTENDANCE_KEYS], // reject clocks the worker out
  [Events.EXCURSION_RETURNED]: [["geofence-excursions"]],
  [Events.EXCURSION_EXPIRED]: [["geofence-excursions"]],

  // Member events → refresh everywhere a member appears. Until these existed there
  // were NO member events in this map at all: another admin's edit, removal, invite
  // or revoke stayed invisible until the viewer reloaded, and — because React Query
  // runs with refetchOnWindowFocus:false — even switching tabs did not fix it.
  // (Audit M-D2 / M-D3.) The payload carries ids only; each client re-reads through
  // its own scoped endpoint, so nothing here widens what a viewer can see.
  [Events.MEMBER_CHANGED]: MEMBER_KEYS,

  // A submitted request already reached the notification bell as a toast, but
  // nothing refreshed the list — so an admin sitting on /join-requests was told
  // about a request that never appeared on the page in front of them (audit A-D1).
  [Events.JOIN_REQUEST_SUBMITTED]: [["join-requests"]],

  // The no-show and shift-reminder engine writes to the entries the attendance
  // board renders — a flagged no-show, an escalation, a reminder that moves
  // `reminderState`. All four were emitted and nothing on the web listened, so the
  // board only caught up on the next manual reload (audit AT-D1).
  [Events.NOSHOW_REMINDER]: [["attendance-no-shows"]],
  [Events.NOSHOW_ESCALATION]: [["attendance-no-shows"]],
  [Events.SHIFT_REMINDER]: ALL_ATTENDANCE_KEYS,
  [Events.SHIFT_ESCALATION]: ALL_ATTENDANCE_KEYS,

  // Space events → refresh the space lists and rosters. Until these existed, a
  // space created/renamed/archived by someone else — or a roster edited by
  // another admin — stayed invisible until the viewer reloaded the page. The
  // payload carries ids only; each client re-reads through its own scoped
  // endpoint, so nothing here widens what a viewer can see.
  [Events.SPACE_CHANGED]: [["locations"], ["locationRosters"]],
  [Events.SPACE_ROSTER_CHANGED]: [["locationRosters"], ["space-assignments"], ["all-location-assignments"]],

  // Location events → invalidate tracking data
  [Events.WORKER_LOCATION]: [["workerLocations"]],

}

export function useRealtimeSync() {
  const queryClient = useQueryClient()
  const { isConnected, subscribe } = useSocketContext()
  const { refreshUser } = useAuth()
  const subscribedRef = useRef(false)

  // Debounced invalidation — batch rapid events
  const pendingInvalidations = useRef(new Set<string>())
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushInvalidations = useCallback(() => {
    const keys = Array.from(pendingInvalidations.current)
    pendingInvalidations.current.clear()

    for (const keyStr of keys) {
      const key = JSON.parse(keyStr)
      queryClient.invalidateQueries({ queryKey: key, refetchType: "all" })
    }
  }, [queryClient])

  const scheduleInvalidation = useCallback((queryKeys: string[][]) => {
    for (const key of queryKeys) {
      pendingInvalidations.current.add(JSON.stringify(key))
    }

    // Debounce: wait 300ms to batch rapid events (e.g. bulk operations)
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    flushTimerRef.current = setTimeout(flushInvalidations, 300)
  }, [flushInvalidations])

  // Also handle task-specific detail invalidation
  const handleTaskEvent = useCallback((event: string, data: TaskEventPayload) => {
    // Get the task ID from the event payload. Some events (task.created,
    // task.assigned) arrive as the raw task object, so fall back to data.id.
    const taskId = data?.task?.id || data?.taskId || data?.id
    if (taskId) {
      // Invalidate the specific task detail query
      pendingInvalidations.current.add(JSON.stringify(["task", taskId]))
      pendingInvalidations.current.add(JSON.stringify(["taskTimeline", taskId]))
    }

    // Also invalidate the employee detail if an assignee is involved
    const assigneeId = data?.task?.assignedToId || data?.assignedToId || data?.workerId || data?.userId
    if (assigneeId) {
      pendingInvalidations.current.add(JSON.stringify(["employee", assigneeId]))
      pendingInvalidations.current.add(JSON.stringify(["employeeTasks", assigneeId]))
    }

    // Standard invalidations for this event type
    const keys = EVENT_INVALIDATIONS[event]
    if (keys) scheduleInvalidation(keys)
  }, [scheduleInvalidation])

  // Subscribe to ALL events — one time
  useEffect(() => {
    if (!isConnected || subscribedRef.current) return
    subscribedRef.current = true

    const unsubs: (() => void)[] = []

    for (const [eventName, queryKeys] of Object.entries(EVENT_INVALIDATIONS)) {
      const isTaskEvent = eventName.startsWith("task.")

      unsubs.push(
        subscribe<TaskEventPayload>(eventName, (data) => {
          if (isTaskEvent) {
            handleTaskEvent(eventName, data)
          } else {
            scheduleInvalidation(queryKeys)
          }
        })
      )
    }

    return () => {
      subscribedRef.current = false
      unsubs.forEach(fn => fn())
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    }
  }, [isConnected, subscribe, handleTaskEvent, scheduleInvalidation])

  // MY OWN access changed. Handled apart from EVENT_INVALIDATIONS because this is
  // not "some data moved" — it is "what I am allowed to see moved", so re-reading
  // one list is not enough.
  //
  // The server has emitted this to the member's own room since the access-profile
  // feature shipped, and NOTHING listened on web or mobile: the change only landed
  // on the next focus/interval reconcile, up to 5 minutes later. (Audit M-D1.)
  //
  // refreshUser() re-reads /auth/me — the gateway has already purged this member's
  // auth cache, so it returns the new profile — and the blanket invalidate drops
  // every cached list, because spaceScope/webScreens decide what those lists were
  // allowed to contain. Rare event, so the cost of invalidating everything is right.
  useEffect(() => {
    if (!isConnected) return
    return subscribe("member.access_updated", () => {
      void refreshUser()
      queryClient.invalidateQueries()
    })
  }, [isConnected, subscribe, refreshUser, queryClient])

  return { isConnected }
}

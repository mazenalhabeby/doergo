"use client"

import { useEffect, useCallback, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useSocketContext } from "@/contexts/socket-context"

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
  // Tracking
  WORKER_LOCATION: "worker.locationUpdated",
  // CRM / Sales — any lead/deal/contact/quote/pipeline mutation
  CRM_CHANGED: "crm.changed",
  // Future: messaging, calls
  MESSAGE_RECEIVED: "message.received",
  CALL_INCOMING: "call.incoming",
} as const

// Every CRM query key — refreshed on any crm.changed event (contacts +
// commissions). The pipeline board is deal-TYPE tasks, so it also refreshes on
// task events (see the board keys added to TASK_* invalidations below).
const ALL_CRM_KEYS: string[][] = [
  ["crm-contacts"],
  ["crm-commission-rules"],
  ["crm-commission-entries"],
]

// The sales pipeline board reads deal-type tasks — refresh it whenever tasks change.
const SALES_BOARD_KEYS: string[][] = [["crm-board"], ["crm-forecast"]]

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

// Query keys that each event should invalidate
const EVENT_INVALIDATIONS: Record<string, string[][]> = {
  // Task events → invalidate task lists, counts, and related
  [Events.TASK_CREATED]: [["tasks"], ["taskStatusCounts"], ...SALES_BOARD_KEYS],
  [Events.TASK_UPDATED]: [["tasks"], ["taskStatusCounts"], ...SALES_BOARD_KEYS],
  [Events.TASK_ASSIGNED]: [["tasks"], ["taskStatusCounts"], ...SALES_BOARD_KEYS],
  [Events.TASK_STATUS_CHANGED]: [["tasks"], ["taskStatusCounts"], ["attendance-active"], ["locationAttendanceBatch"], ...SALES_BOARD_KEYS],
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

  // Location events → invalidate tracking data
  [Events.WORKER_LOCATION]: [["workerLocations"]],

  // CRM events → refresh every open CRM view (board, lists, forecast).
  [Events.CRM_CHANGED]: ALL_CRM_KEYS,
}

export function useRealtimeSync() {
  const queryClient = useQueryClient()
  const { isConnected, subscribe } = useSocketContext()
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
  const handleTaskEvent = useCallback((event: string, data: any) => {
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
        subscribe(eventName, (data: any) => {
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

  return { isConnected }
}

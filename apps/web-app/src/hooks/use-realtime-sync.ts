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
  // Future: messaging, calls
  MESSAGE_RECEIVED: "message.received",
  CALL_INCOMING: "call.incoming",
} as const

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
  [Events.CLOCK_IN]: [["attendance-active"], ["locationAttendanceBatch"], ["pending-approvals"], ["active-breaks"], ["orgMembers", "dashboard"]],
  [Events.CLOCK_OUT]: [["attendance-active"], ["locationAttendanceBatch"], ["pending-approvals"], ["active-breaks"], ["orgMembers", "dashboard"]],
  [Events.BREAK_STARTED]: [["active-breaks"], ["attendance-active"], ["locationAttendanceBatch"]],
  [Events.BREAK_ENDED]: [["active-breaks"], ["attendance-active"], ["locationAttendanceBatch"]],

  // Availability change → refresh the dashboard roster + contacts (their dot updates)
  [Events.PRESENCE_CHANGED]: [["orgMembers", "dashboard"], ["orgContacts"]],

  // Geofence excursion → refresh the approver panel (["geofence-excursions"]).
  // out/reported/returned change the pending list; approved/rejected/expired also
  // touch clock state (reject clocks out) so refresh the dashboard attendance too.
  [Events.EXCURSION_OUT]: [["geofence-excursions"]],
  [Events.EXCURSION_REQUESTED]: [["geofence-excursions"]],
  [Events.EXCURSION_APPROVED]: [["geofence-excursions"]],
  [Events.EXCURSION_REJECTED]: [["geofence-excursions"], ["attendance-active"], ["locationAttendanceBatch"], ["orgMembers", "dashboard"]],
  [Events.EXCURSION_RETURNED]: [["geofence-excursions"]],
  [Events.EXCURSION_EXPIRED]: [["geofence-excursions"]],

  // Location events → invalidate tracking data
  [Events.WORKER_LOCATION]: [["workerLocations"]],
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

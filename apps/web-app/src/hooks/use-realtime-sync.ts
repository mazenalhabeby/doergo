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
  [Events.TASK_STATUS_CHANGED]: [["tasks"], ["taskStatusCounts"], ["attendance-today"]],
  [Events.TASK_COMMENT_ADDED]: [["tasks"]],
  [Events.TASK_ATTACHMENT_ADDED]: [["tasks"]],
  [Events.TASK_DECLINED]: [["tasks"], ["taskStatusCounts"]],
  [Events.TASK_DELETED]: [["tasks"], ["taskStatusCounts"]],

  // Attendance events → invalidate attendance + dashboard
  [Events.CLOCK_IN]: [["attendance-today"], ["active-breaks"], ["orgMembers-dashboard"]],
  [Events.CLOCK_OUT]: [["attendance-today"], ["active-breaks"], ["orgMembers-dashboard"]],
  [Events.BREAK_STARTED]: [["active-breaks"], ["attendance-today"]],
  [Events.BREAK_ENDED]: [["active-breaks"], ["attendance-today"]],

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

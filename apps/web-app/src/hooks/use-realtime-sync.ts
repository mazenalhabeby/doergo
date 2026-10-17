"use client"

import { keys } from "@/lib/query-keys"
import { useEffect, useCallback, useRef } from "react"
import type { TaskEventPayload } from "@/types/socket-events"
import { useQueryClient } from "@tanstack/react-query"
import type { QueryKey } from "@tanstack/react-query"
import { useSocketContext } from "@/contexts/socket-context"
import { useAuth } from "@/contexts/auth-context"
import { EVENT_INVALIDATIONS, APPROVAL_EVENTS } from "./realtime-events"

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

for (const e of APPROVAL_EVENTS) {
  EVENT_INVALIDATIONS[e] = [...(EVENT_INVALIDATIONS[e] ?? []), keys.approvals.all()]
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
    const pending = Array.from(pendingInvalidations.current)
    pendingInvalidations.current.clear()

    for (const keyStr of pending) {
      const key = JSON.parse(keyStr)
      queryClient.invalidateQueries({ queryKey: key, refetchType: "all" })
    }
  }, [queryClient])

  const scheduleInvalidation = useCallback((queryKeys: QueryKey[]) => {
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
      pendingInvalidations.current.add(JSON.stringify(keys.tasks.detail(taskId)))
      pendingInvalidations.current.add(JSON.stringify(keys.tasks.timeline(taskId)))
    }

  // Also invalidate the employee detail if an assignee is involved
  const assigneeId = data?.task?.assignedToId || data?.assignedToId || data?.workerId || data?.userId
  if (assigneeId) {
    pendingInvalidations.current.add(JSON.stringify(keys.memberRecord.employee(assigneeId)))
  }

    // Standard invalidations for this event type
    const eventKeys = EVENT_INVALIDATIONS[event]
    if (eventKeys) scheduleInvalidation(eventKeys)
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

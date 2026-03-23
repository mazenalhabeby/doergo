"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"
import { useSocket, SocketEvents, type SocketUser } from "@/lib/socket"

/**
 * Hook that subscribes to Socket.IO task events and auto-invalidates queries.
 *
 * - Without taskId: invalidates task list queries (for task list page)
 * - With taskId: also invalidates task detail + timeline queries (for task detail page)
 */
export function useTaskEvents(taskId?: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const socketUser: SocketUser | null = user
    ? { id: user.id, role: user.role, organizationId: user.organizationId }
    : null

  const { isConnected, connect, subscribe } = useSocket(socketUser)

  // Connect on mount
  useEffect(() => {
    if (!user) return
    connect()
  }, [user, connect])

  // Subscribe to list-level events (task created, assigned, status changed)
  useEffect(() => {
    if (!isConnected) return

    const unsubs: (() => void)[] = []

    const invalidateList = () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"], refetchType: "all" })
    }

    unsubs.push(subscribe(SocketEvents.TASK_CREATED, invalidateList))
    unsubs.push(subscribe(SocketEvents.TASK_ASSIGNED, invalidateList))
    unsubs.push(subscribe(SocketEvents.TASK_STATUS_CHANGED, invalidateList))

    return () => unsubs.forEach((fn) => fn())
  }, [isConnected, subscribe, queryClient])

  // Subscribe to detail-level events (task updated, comment added, attachment added)
  useEffect(() => {
    if (!isConnected || !taskId) return

    const unsubs: (() => void)[] = []

    const invalidateDetail = () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskTimeline", taskId], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskReport", taskId], refetchType: "all" })
    }

    unsubs.push(subscribe(SocketEvents.TASK_UPDATED, invalidateDetail))
    unsubs.push(subscribe(SocketEvents.TASK_COMMENT_ADDED, invalidateDetail))
    unsubs.push(subscribe(SocketEvents.TASK_ATTACHMENT_ADDED, invalidateDetail))
    // Also invalidate detail on status change
    unsubs.push(subscribe(SocketEvents.TASK_STATUS_CHANGED, invalidateDetail))

    return () => unsubs.forEach((fn) => fn())
  }, [isConnected, taskId, subscribe, queryClient])

  return { isConnected }
}

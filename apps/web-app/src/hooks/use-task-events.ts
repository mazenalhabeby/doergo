"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useSocketContext } from "@/contexts/socket-context"
import { SocketEvents } from "@/lib/socket"

/**
 * Hook that subscribes to Socket.IO task events and auto-invalidates queries.
 * Uses the shared socket context — no extra connections created.
 */
export function useTaskEvents(taskId?: string) {
  const queryClient = useQueryClient()
  const { isConnected, subscribe } = useSocketContext()

  // Subscribe to list-level events
  useEffect(() => {
    if (!isConnected) return

    const invalidateList = () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"], refetchType: "all" })
    }

    const unsubs = [
      subscribe(SocketEvents.TASK_CREATED, invalidateList),
      subscribe(SocketEvents.TASK_ASSIGNED, invalidateList),
      subscribe(SocketEvents.TASK_UPDATED, invalidateList),
      subscribe(SocketEvents.TASK_STATUS_CHANGED, invalidateList),
    ]

    return () => unsubs.forEach(fn => fn())
  }, [isConnected, subscribe, queryClient])

  // Subscribe to detail-level events
  useEffect(() => {
    if (!isConnected || !taskId) return

    const invalidateDetail = () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskTimeline", taskId], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskReport", taskId], refetchType: "all" })
    }

    const unsubs = [
      subscribe(SocketEvents.TASK_UPDATED, invalidateDetail),
      subscribe(SocketEvents.TASK_COMMENT_ADDED, invalidateDetail),
      subscribe(SocketEvents.TASK_ATTACHMENT_ADDED, invalidateDetail),
      subscribe(SocketEvents.TASK_STATUS_CHANGED, invalidateDetail),
    ]

    return () => unsubs.forEach(fn => fn())
  }, [isConnected, taskId, subscribe, queryClient])

  return { isConnected }
}

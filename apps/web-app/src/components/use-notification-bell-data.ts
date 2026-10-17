"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { usersApi, type InboxNotification } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useSocketContext } from "@/contexts/socket-context"
import { useChat } from "@/components/chat/chat-context"
import { keys } from "@/lib/query-keys"
import { useAfterFirstLoad } from "@/hooks/use-after-first-load"

// ============================================================================
// Types
// ============================================================================

export type NotificationType =
  | "task_created" | "task_assigned" | "task_completed" | "task_declined"
  | "task_status_changed" | "comment_added" | "attachment_added"
  | "join_request" | "join_approved" | "join_rejected"
  | "clock_in" | "clock_out" | "geofence_alert"
  | "pending_approval"
  | "break_started" | "break_ended"
  | "invitation_created"
  | "chat_message"
  | "crm_reminder"
  | "signature_needed"
  | "time_off_requested" | "time_off_decided"
  | "asset_expense" | "asset_expense_decided" | "asset_handover"

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  link?: string
  read: boolean
  createdAt: Date
}

// Map a persisted delivery eventType → the bell's NotificationType (for icon/color).
export function eventTypeToNotifType(eventType: string): NotificationType {
  const map: Record<string, NotificationType> = {
    "task.assigned": "task_assigned",
    "task.statusChanged": "task_status_changed",
    "task.created": "task_created",
    "attendance_pending_approval": "pending_approval",
    "attendance_geofence_alert": "geofence_alert",
    "join_request_submitted": "join_request",
    "chat.message": "chat_message",
    "customer_reminder_due": "crm_reminder",
    "document_awaiting_signature": "signature_needed",
    "time_off_requested": "time_off_requested",
    "time_off_decided": "time_off_decided",
    "asset.expense_submitted": "asset_expense",
    "asset.expense_decided": "asset_expense_decided",
    "asset.handed_over": "asset_handover",
  }
  return map[eventType] || "task_status_changed"
}

export function mapInboxItem(item: InboxNotification): Notification {
  return {
    id: item.id,
    type: eventTypeToNotifType(item.eventType),
    title: (item.payload?.title as string) || "Notification",
    message: (item.payload?.body as string) || "",
    link: (item.payload?.link as string) || undefined,
    read: !!item.readAt,
    createdAt: new Date(item.createdAt),
  }
}

/** useNotificationBell's state and handlers — everything before its markup, moved here unchanged. */
export function useNotificationBellData() {
  const { user, hasPermission } = useAuth()
  const { openChatWith } = useChat()
  const { t } = useTranslation()
  const router = useRouter()
  // The management /attendance page is ADMIN / can-view-all-tasks only; everyone else has
  // /my/attendance. Route attendance notifications to the page the viewer can open.
  const attendanceHref = user?.role === "ADMIN" || hasPermission('canViewSpaceAttendance') || hasPermission('canViewAllTasks')
    ? "/attendance"
    : "/my/attendance"
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const idCounter = useRef(0)
  const seededRef = useRef(false)

  const { isConnected, subscribe } = useSocketContext()

  // ── Load the persisted inbox once, then keep live events on top ──────
  // After the page's own first load (live events still arrive on the socket
  // meanwhile and are kept on top); opening the bell asks at once.
  const afterFirstLoad = useAfterFirstLoad()
  const { data: inbox } = useQuery({
    queryKey: keys.notifications.inbox(),
    queryFn: () => usersApi.getNotifications(50),
    staleTime: 60_000,
    enabled: afterFirstLoad || open,
  })
  useEffect(() => {
    if (!inbox || seededRef.current) return
    seededRef.current = true
    const persisted = inbox.items.map(mapInboxItem)
    // Live events that arrived before the fetch stay on top; persisted below.
    setNotifications(prev => [...prev, ...persisted].slice(0, 50))
  }, [inbox])

  // ── Add notification helper ────────────────────────────────────────
  const add = useCallback((type: NotificationType, title: string, message: string, link?: string) => {
    idCounter.current += 1
    setNotifications(prev => [{
      id: `n-${idCounter.current}-${Date.now()}`,
      type, title, message, link,
      read: false,
      createdAt: new Date(),
    }, ...prev].slice(0, 50))
  }, [])

  return {
    user,
    openChatWith,
    t,
    router,
    attendanceHref,
    notifications,
    setNotifications,
    open,
    setOpen,
    isConnected,
    subscribe,
    add,
  }
}

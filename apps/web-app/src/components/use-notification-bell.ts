"use client"

import { personName } from "@hbcfield/shared/client"
import { useState, useEffect, useCallback, useRef } from "react"
import type { TaskEventPayload } from "@/types/socket-events"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { isSameAppPath } from "@/lib/safe-links"
import type { TFunction } from "i18next"
import { useQuery } from "@tanstack/react-query"
import { usersApi, type InboxNotification } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useSocketContext } from "@/contexts/socket-context"
import { useChat } from "@/components/chat/chat-context"
import { keys } from "@/lib/query-keys"
import { useAfterFirstLoad } from "@/hooks/use-after-first-load"
import { useNotificationBellData, type Notification } from "./use-notification-bell-data"
import { useNotificationBellData2 } from "./use-notification-bell-data2"
export { evTaskTitle, taskLink, type ChatEventPayload, type JoinRequestEventPayload, type AttendanceEventPayload, attendanceInfo, type BreakEventPayload, evTaskId } from "./use-notification-bell-data2"
export { type Notification, mapInboxItem, type NotificationType, eventTypeToNotifType } from "./use-notification-bell-data"

/** NotificationBell's state and handlers — everything before its markup, moved here unchanged. */
export function useNotificationBell() {
  const {
    openChatWith,
    t,
    router,
    notifications,
    setNotifications,
    open,
    setOpen,
    isConnected,
  } = useNotificationBellData2()

  // ── Actions ────────────────────────────────────────────────────────
  const unreadCount = notifications.filter(n => !n.read).length

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    usersApi.markNotificationsRead().catch(() => {}) // persist read state
  }, [])
  const clearAll = () => setNotifications([])

  const handleClick = (notif: Notification) => {
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n))
    if (notif.link?.startsWith("chat:")) {
      // Chat opens the drawer (not a route). link = "chat:<senderUserId>".
      setOpen(false)
      openChatWith(notif.link.slice(5))
    } else if (isSameAppPath(notif.link)) {
      // Only a path inside this app: a notification link is data, and
      // `//host` would leave the product looking like an in-app jump.
      setOpen(false)
      router.push(notif.link)
    }
  }

  return {
    t,
    notifications,
    open,
    setOpen,
    isConnected,
    unreadCount,
    markAllRead,
    clearAll,
    handleClick,
  }
}

"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { isSameAppPath } from "@/lib/safe-links"
import { usersApi } from "@/lib/api"
import { useChat } from "@/components/chat/chat-context"
import { type Notification, useNotificationInbox } from "./use-notification-inbox"
import { useLiveNotifications } from "./use-live-notifications"
export { type NotificationType } from "./use-notification-inbox"

/** The bell's list (persisted + live), its open state, and what reading or clicking an entry does. */
export function useNotificationBell() {
  const { openChatWith } = useChat()
  const router = useRouter()
  const { user, attendanceHref, notifications, setNotifications, open, setOpen, isConnected, subscribe, add } =
    useNotificationInbox()
  useLiveNotifications({ userId: user?.id, attendanceHref, isConnected, subscribe, add })

  // ── Actions ────────────────────────────────────────────────────────
  const unreadCount = notifications.filter((n) => !n.read).length

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    usersApi.markNotificationsRead().catch(() => {}) // persist read state
  }, [])
  const clearAll = () => setNotifications([])

  const handleClick = (notif: Notification) => {
    setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)))
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

  return { notifications, open, setOpen, isConnected, unreadCount, markAllRead, clearAll, handleClick }
}

"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Bell, UserPlus, ClipboardList, MessageSquare, CheckCircle,
  AlertTriangle, Clock, MapPin, Coffee, Paperclip, XCircle, Send, ClipboardCheck,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { formatDistanceToNow } from "date-fns"

import { useAuth } from "@/contexts/auth-context"
import { useSocketContext } from "@/contexts/socket-context"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

// ============================================================================
// Types
// ============================================================================

type NotificationType =
  | "task_created" | "task_assigned" | "task_completed" | "task_declined"
  | "task_status_changed" | "comment_added" | "attachment_added"
  | "join_request" | "join_approved" | "join_rejected"
  | "clock_in" | "clock_out" | "auto_clock_out" | "geofence_alert"
  | "pending_approval"
  | "break_started" | "break_ended"
  | "invitation_created"

interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  link?: string
  read: boolean
  createdAt: Date
}

// ============================================================================
// Config — icon + color per notification type (DRY)
// ============================================================================

const TYPE_CONFIG: Record<NotificationType, { icon: typeof Bell; color: string; bg: string }> = {
  task_created:       { icon: ClipboardList, color: "text-indigo-600", bg: "bg-indigo-50" },
  task_assigned:      { icon: ClipboardList, color: "text-blue-600", bg: "bg-blue-50" },
  task_completed:     { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
  task_declined:      { icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
  task_status_changed:{ icon: ClipboardList, color: "text-muted-foreground", bg: "bg-muted" },
  comment_added:      { icon: MessageSquare, color: "text-amber-600", bg: "bg-amber-50" },
  attachment_added:   { icon: Paperclip, color: "text-cyan-600", bg: "bg-cyan-50" },
  join_request:       { icon: UserPlus, color: "text-purple-600", bg: "bg-purple-50" },
  join_approved:      { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
  join_rejected:      { icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
  clock_in:           { icon: Clock, color: "text-green-600", bg: "bg-green-50" },
  clock_out:          { icon: Clock, color: "text-muted-foreground", bg: "bg-muted" },
  auto_clock_out:     { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
  geofence_alert:     { icon: MapPin, color: "text-red-600", bg: "bg-red-50" },
  pending_approval:   { icon: ClipboardCheck, color: "text-amber-600", bg: "bg-amber-50" },
  break_started:      { icon: Coffee, color: "text-amber-600", bg: "bg-amber-50" },
  break_ended:        { icon: Coffee, color: "text-green-600", bg: "bg-green-50" },
  invitation_created: { icon: Send, color: "text-indigo-600", bg: "bg-indigo-50" },
}

// ============================================================================
// Component
// ============================================================================

export function NotificationBell() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const idCounter = useRef(0)

  const { isConnected, subscribe } = useSocketContext()

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

  // ── Subscribe to ALL socket events ─────────────────────────────────
  useEffect(() => {
    if (!isConnected) return

    const unsubs = [
      // Task events
      subscribe("task.created", (d: any) => {
        add("task_created", t("notifications.taskCreated"), d.task?.title || "", `/tasks/${d.task?.id}`)
      }),
      subscribe("task.assigned", (d: any) => {
        add("task_assigned", t("notifications.taskAssigned"), d.task?.title || "", `/tasks/${d.task?.id}`)
      }),
      subscribe("task.statusChanged", (d: any) => {
        if (d.newStatus === "COMPLETED") {
          add("task_completed", t("notifications.taskCompleted"), d.task?.title || "", `/tasks/${d.task?.id}`)
        } else if (d.newStatus === "BLOCKED") {
          add("task_status_changed", t("notifications.taskBlocked"), d.task?.title || "", `/tasks/${d.task?.id}`)
        } else {
          add("task_status_changed", t("notifications.taskStatusChanged", { status: d.newStatus }), d.task?.title || "", `/tasks/${d.task?.id}`)
        }
      }),
      subscribe("task.declined", (d: any) => {
        add("task_declined", t("notifications.taskDeclined"), d.task?.title || "", `/tasks/${d.task?.id}`)
      }),
      subscribe("task.commentAdded", (d: any) => {
        add("comment_added", t("notifications.commentAdded"), d.task?.title || d.comment?.content?.slice(0, 50) || "", `/tasks/${d.taskId || d.task?.id}`)
      }),
      subscribe("task.attachmentAdded", (d: any) => {
        add("attachment_added", t("notifications.attachmentAdded"), d.attachment?.fileName || "", `/tasks/${d.taskId || d.task?.id}`)
      }),

      // Join request events
      subscribe("join_request_submitted", (d: any) => {
        add("join_request", t("notifications.joinRequest"), d.userName || d.userEmail || "", "/join-requests")
      }),
      subscribe("join_request_approved", (d: any) => {
        add("join_approved", t("notifications.joinApproved"), d.organizationName || "", "/members")
      }),
      subscribe("join_request_rejected", (d: any) => {
        add("join_rejected", t("notifications.joinRejected"), d.reason || "", "/join-requests")
      }),

      // Attendance events
      subscribe("attendance.clockIn", (d: any) => {
        add("clock_in", t("notifications.clockIn"), d.userName || "", "/attendance")
      }),
      subscribe("attendance.clockOut", (d: any) => {
        add("clock_out", t("notifications.clockOut"), d.userName || "", "/attendance")
      }),
      subscribe("attendance_auto_clock_out", (d: any) => {
        add("auto_clock_out", t("notifications.autoClockOut"), d.userName || "", "/attendance")
      }),
      subscribe("attendance_geofence_alert", (d: any) => {
        add("geofence_alert", t("notifications.geofenceAlert"), d.userName || "", "/attendance")
      }),
      subscribe("attendance_pending_approval", (d: any) => {
        add(
          "pending_approval",
          t("notifications.pendingApproval"),
          [d.userName, d.flagSummary].filter(Boolean).join(" — "),
          "/attendance?tab=approvals",
        )
      }),

      // Break events
      subscribe("break.started", (d: any) => {
        add("break_started", t("notifications.breakStarted"), d.userName || "", "/attendance")
      }),
      subscribe("break.ended", (d: any) => {
        add("break_ended", t("notifications.breakEnded"), d.userName || "", "/attendance")
      }),
    ]

    return () => unsubs.forEach(fn => fn())
  }, [isConnected, subscribe, add, t])

  // ── Actions ────────────────────────────────────────────────────────
  const unreadCount = notifications.filter(n => !n.read).length

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  const clearAll = () => setNotifications([])

  const handleClick = (notif: Notification) => {
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n))
    if (notif.link) {
      setOpen(false)
      router.push(notif.link)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-lg">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 rounded-xl shadow-xl border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{t("notifications.title")}</h3>
            {isConnected && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
          </div>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={markAllRead}>
                {t("notifications.markAllRead")}
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-muted-foreground" onClick={clearAll}>
                {t("notifications.clearAll")}
              </Button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="max-h-[420px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-12 text-center">
              <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t("notifications.empty")}</p>
            </div>
          ) : (
            notifications.map(notif => {
              const config = TYPE_CONFIG[notif.type]
              const Icon = config.icon
              return (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={cn(
                    "w-full flex gap-3 px-4 py-3 text-left transition-colors hover:bg-muted border-b border-border last:border-0",
                    !notif.read && "bg-blue-50/40"
                  )}
                >
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", config.bg)}>
                    <Icon className={cn("h-4 w-4", config.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm truncate", notif.read ? "text-muted-foreground" : "text-foreground font-medium")}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{notif.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(notif.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                  {!notif.read && (
                    <div className="flex items-center">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                    </div>
                  )}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

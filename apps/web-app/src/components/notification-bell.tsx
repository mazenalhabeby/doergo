"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { TaskEventPayload } from "@/types/socket-events"
import {
  Bell, UserPlus, ClipboardList, MessageSquare, CheckCircle,
  AlertTriangle, Clock, MapPin, Coffee, Paperclip, XCircle, Send, ClipboardCheck, PenLine,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { formatDistanceToNow } from "date-fns"
import type { TFunction } from "i18next"
import { useQuery } from "@tanstack/react-query"

import { usersApi, type InboxNotification } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useSocketContext } from "@/contexts/socket-context"
import { useChat } from "@/components/chat/chat-drawer"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

// ============================================================================
// Socket payload helpers
// ============================================================================
/*
  What the socket sends.

  Every field is optional and every reader is tolerant, because these payloads
  come from four different services and genuinely differ per event — that is the
  reason they were `any`. Optional-everything says the same thing while still
  catching a typo'd field name, which `any` never did.
*/

interface ChatEventPayload {
  message?: {
    senderId?: string
    body?: string
    sender?: { firstName?: string; lastName?: string } | null
  } | null
}

interface JoinRequestEventPayload {
  userName?: string
  userEmail?: string
  organizationName?: string
  reason?: string
}

interface AttendanceEventPayload {
  userName?: string
  flagSummary?: string
  timeEntry?: {
    isRemote?: boolean
    clockInPlace?: string | null
    clockOutPlace?: string | null
    location?: { name?: string } | null
    user?: { firstName?: string; lastName?: string } | null
  } | null
}

interface BreakEventPayload {
  break?: { userName?: string } | null
}

// ============================================================================
// Task socket events arrive in two shapes: some (task.created, task.assigned)
// are emitted as the RAW task object, others (statusChanged, declined, comment,
// attachment) are wrapped as { task, ... } or carry a flat taskId. Read the id
// and title tolerantly so the deep-link never becomes "/tasks/undefined".
const evTaskId = (d: TaskEventPayload): string | undefined => d?.task?.id ?? d?.taskId ?? d?.id
const evTaskTitle = (d: TaskEventPayload): string => d?.task?.title ?? d?.title ?? ""
const taskLink = (d: TaskEventPayload): string | undefined => {
  const id = evTaskId(d)
  return id ? `/tasks/${id}` : undefined
}

// Attendance events carry { userId, timeEntry }. Pull a readable name (from the
// included user) and where the shift happened (site name, or "Remote · city").
const attendanceInfo = (d: AttendanceEventPayload, remotePlace: string | null | undefined, t: TFunction) => {
  const te = d?.timeEntry
  const u = te?.user
  const name = d?.userName || (u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : "")
  const place = te?.isRemote
    ? `${t("attendance.my.remote", "Remote")}${remotePlace ? ` · ${remotePlace}` : ""}`
    : te?.location?.name || ""
  return { name, place }
}

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
  | "chat_message"
  | "crm_reminder"
  | "signature_needed"

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
  chat_message:       { icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-50" },
  crm_reminder:       { icon: Bell, color: "text-indigo-600", bg: "bg-indigo-50" },
  signature_needed:   { icon: PenLine, color: "text-amber-600", bg: "bg-amber-50" },
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

// Map a persisted delivery eventType → the bell's NotificationType (for icon/color).
function eventTypeToNotifType(eventType: string): NotificationType {
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
  }
  return map[eventType] || "task_status_changed"
}

function mapInboxItem(item: InboxNotification): Notification {
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

// ============================================================================
// Component
// ============================================================================

export function NotificationBell() {
  const { user } = useAuth()
  const { openChatWith } = useChat()
  const { t } = useTranslation()
  const router = useRouter()
  // The management /attendance page is ADMIN / can-view-all-tasks only; everyone else has
  // /my/attendance. Route attendance notifications to the page the viewer can open.
  const attendanceHref = user?.role === "ADMIN" || !!user?.canViewSpaceAttendance || !!user?.canViewAllTasks ? "/attendance" : "/my/attendance"
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const idCounter = useRef(0)
  const seededRef = useRef(false)

  const { isConnected, subscribe } = useSocketContext()

  // ── Load the persisted inbox once, then keep live events on top ──────
  const { data: inbox } = useQuery({
    queryKey: ["inboxNotifications"],
    queryFn: () => usersApi.getNotifications(50),
    staleTime: 60_000,
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

  // ── Subscribe to ALL socket events ─────────────────────────────────
  useEffect(() => {
    if (!isConnected) return

    const unsubs = [
      // Task events
      subscribe<TaskEventPayload>("task.created", (d) => {
        add("task_created", t("notifications.taskCreated"), evTaskTitle(d), taskLink(d))
      }),
      subscribe<TaskEventPayload>("task.assigned", (d) => {
        add("task_assigned", t("notifications.taskAssigned"), evTaskTitle(d), taskLink(d))
      }),
      subscribe<TaskEventPayload>("task.statusChanged", (d) => {
        if (d.newStatus === "COMPLETED") {
          add("task_completed", t("notifications.taskCompleted"), evTaskTitle(d), taskLink(d))
        } else if (d.newStatus === "BLOCKED") {
          add("task_status_changed", t("notifications.taskBlocked"), evTaskTitle(d), taskLink(d))
        } else {
          add("task_status_changed", t("notifications.taskStatusChanged", { status: d.newStatus }), evTaskTitle(d), taskLink(d))
        }
      }),
      subscribe<TaskEventPayload>("task.declined", (d) => {
        add("task_declined", t("notifications.taskDeclined"), evTaskTitle(d), taskLink(d))
      }),
      subscribe<TaskEventPayload>("task.commentAdded", (d) => {
        add("comment_added", t("notifications.commentAdded"), evTaskTitle(d) || d.comment?.content?.slice(0, 50) || "", taskLink(d))
      }),
      subscribe<TaskEventPayload>("task.attachmentAdded", (d) => {
        add("attachment_added", t("notifications.attachmentAdded"), d.attachment?.fileName || "", taskLink(d))
      }),

      // Chat: an incoming message from a colleague → persistent notification.
      subscribe<ChatEventPayload>("chat.message", (d) => {
        const m = d?.message
        if (!m || !m.senderId || m.senderId === user?.id) return
        const name = m.sender ? `${m.sender.firstName} ${m.sender.lastName}`.trim() : t("chat.title", "Messages")
        add("chat_message", name, (m.body || "").slice(0, 80), `chat:${m.senderId}`)
      }),

      /*
        A document has reached this person's step of a signing chain.

        It was emitted and nothing on any client listened — the same shape as
        the CRM reminder below, and with the same consequence: the phone got a
        push and the web got nothing at all. Worse here, because the person the
        chain is waiting on is usually at a desk, and a document that nobody
        knows about stops a whole month's time sheet.
      */
      subscribe<{ documentId: string; title?: string; memberName?: string }>(
        "document_awaiting_signature",
        (d) => {
          add(
            "signature_needed",
            t("notifications.signatureNeeded", "Your signature is needed"),
            // Whose document it is — a manager with nine people cannot act on
            // "a time sheet needs signing".
            [d?.memberName, d?.title].filter(Boolean).join(" — "),
            "/my/documents",
          )
        },
      ),

      // A CRM follow-up fell due. Emitted to each assigned manager with a complete
      // payload (client name, note, kind) — it needs no query, which is why it can
      // be surfaced directly instead of invalidating something. It was emitted and
      // nothing on any client listened (audit C-D1); mobile got the push, the web
      // got nothing at all.
      subscribe<{ customerId: string; customerName?: string; body?: string }>("customer.reminder", (d) => {
        add(
          "crm_reminder",
          t("notifications.crmReminder"),
          [d.customerName, d.body].filter(Boolean).join(" — "),
          d.customerId ? `/customers/${d.customerId}` : "/clients",
        )
      }),

      // Join request events
      subscribe<JoinRequestEventPayload>("join_request_submitted", (d) => {
        add("join_request", t("notifications.joinRequest"), d.userName || d.userEmail || "", "/join-requests")
      }),
      subscribe<JoinRequestEventPayload>("join_request_approved", (d) => {
        add("join_approved", t("notifications.joinApproved"), d.organizationName || "", "/members")
      }),
      subscribe<JoinRequestEventPayload>("join_request_rejected", (d) => {
        add("join_rejected", t("notifications.joinRejected"), d.reason || "", "/join-requests")
      }),

      // Attendance events
      subscribe<AttendanceEventPayload>("attendance.clockIn", (d) => {
        const { name, place } = attendanceInfo(d, d?.timeEntry?.clockInPlace, t)
        add("clock_in", name || t("notifications.clockIn"), [t("notifications.clockInAction", "Clocked in"), place].filter(Boolean).join(" · "), attendanceHref)
      }),
      subscribe<AttendanceEventPayload>("attendance.clockOut", (d) => {
        const { name, place } = attendanceInfo(d, d?.timeEntry?.clockOutPlace ?? d?.timeEntry?.clockInPlace, t)
        add("clock_out", name || t("notifications.clockOut"), [t("notifications.clockOutAction", "Clocked out"), place].filter(Boolean).join(" · "), attendanceHref)
      }),
      subscribe<AttendanceEventPayload>("attendance_auto_clock_out", (d) => {
        add("auto_clock_out", t("notifications.autoClockOut"), d.userName || "", attendanceHref)
      }),
      subscribe<AttendanceEventPayload>("attendance_geofence_alert", (d) => {
        add("geofence_alert", t("notifications.geofenceAlert"), d.userName || "", attendanceHref)
      }),
      subscribe<AttendanceEventPayload>("attendance_pending_approval", (d) => {
        add(
          "pending_approval",
          t("notifications.pendingApproval"),
          [d.userName, d.flagSummary].filter(Boolean).join(" — "),
          "/attendance?tab=approvals",
        )
      }),

      // Break events — the name is nested under `break` in the payload.
      subscribe<BreakEventPayload>("break.started", (d) => {
        add("break_started", d.break?.userName || t("notifications.breakStarted"), t("notifications.breakStarted"), attendanceHref)
      }),
      subscribe<BreakEventPayload>("break.ended", (d) => {
        add("break_ended", d.break?.userName || t("notifications.breakEnded"), t("notifications.breakEnded"), attendanceHref)
      }),
    ]

    return () => unsubs.forEach(fn => fn())
  }, [isConnected, subscribe, add, t, attendanceHref])

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
    } else if (notif.link) {
      setOpen(false)
      router.push(notif.link)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o && unreadCount > 0) markAllRead() }}>
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
                    "w-full flex gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 border-b border-border last:border-0",
                    !notif.read && "bg-primary/5"
                  )}
                >
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", config.bg)}>
                    <Icon className={cn("h-4 w-4", config.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm truncate", notif.read ? "text-muted-foreground" : "text-foreground font-medium")}>
                      {notif.title}
                    </p>
                    {notif.message && <p className="text-xs text-foreground/70 truncate">{notif.message}</p>}
                    <p className="text-[11px] text-muted-foreground mt-0.5">
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

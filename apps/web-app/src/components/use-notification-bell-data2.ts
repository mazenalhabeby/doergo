"use client"

import { personName } from "@hbcfield/shared/client"
import { useEffect } from "react"
import type { TaskEventPayload } from "@/types/socket-events"
import type { TFunction } from "i18next"
import { useNotificationBellData } from "./use-notification-bell-data"

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

export interface ChatEventPayload {
  message?: {
    senderId?: string
    body?: string
    sender?: { firstName?: string; lastName?: string } | null
  } | null
}

export interface JoinRequestEventPayload {
  userName?: string
  userEmail?: string
  organizationName?: string
  reason?: string
}

export interface AttendanceEventPayload {
  userName?: string
  flagSummary?: string
  timeEntry?: {
    isRemote?: boolean
    location?: { name?: string } | null
    user?: { firstName?: string; lastName?: string } | null
  } | null
}

export interface BreakEventPayload {
  break?: { userName?: string } | null
}

// ============================================================================
// Task socket events arrive in two shapes: some (task.created, task.assigned)
// are emitted as the RAW task object, others (statusChanged, declined, comment,
// attachment) are wrapped as { task, ... } or carry a flat taskId. Read the id
// and title tolerantly so the deep-link never becomes "/tasks/undefined".
export const evTaskId = (d: TaskEventPayload): string | undefined => d?.task?.id ?? d?.taskId ?? d?.id

export const evTaskTitle = (d: TaskEventPayload): string => d?.task?.title ?? d?.title ?? ""

export const taskLink = (d: TaskEventPayload): string | undefined => {
  const id = evTaskId(d)
  return id ? `/tasks/${id}` : undefined
}

// Attendance events carry { userId, timeEntry }. Pull a readable name (from the
// included user) and where the shift happened (site name, or "Remote · city").
// The clock event no longer carries the reverse-geocoded clock-in/-out address
// (a member's whereabouts do not travel to every screen in the organization):
// away from a site reads "Remote", at a site its name.
export const attendanceInfo = (d: AttendanceEventPayload, t: TFunction) => {
  const te = d?.timeEntry
  const u = te?.user
  const name = d?.userName || personName(u)
  const place = te?.isRemote ? t("attendance.my.remote", "Remote") : te?.location?.name || ""
  return { name, place }
}

/** useNotificationBell's state and handlers — everything before its markup, moved here unchanged. */
export function useNotificationBellData2() {
  const {
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
  } = useNotificationBellData()

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
        const name = m.sender ? personName(m.sender) : t("chat.title", "Messages")
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

      // Leave. The request goes to whoever is routed about that member; the
      // decision comes back only to the member who asked. Both land here as the
      // live half of the same bell entry the server has already persisted.
      subscribe<{ memberName?: string; startDate?: string; endDate?: string }>("time_off_requested", (d) => {
        add(
          "time_off_requested",
          t("notifications.timeOffRequest", "Time-off request"),
          [d.memberName, [d.startDate, d.endDate].filter(Boolean).join(" → ")].filter(Boolean).join(" — "),
          "/employees/availability",
        )
      }),
      subscribe<{ approved?: boolean; rejectionReason?: string | null; startDate?: string; endDate?: string }>("time_off_decided", (d) => {
        add(
          "time_off_decided",
          d.approved
            ? t("notifications.timeOffApproved", "Time off approved")
            : t("notifications.timeOffRejected", "Time off not approved"),
          [[d.startDate, d.endDate].filter(Boolean).join(" → "), d.rejectionReason].filter(Boolean).join(" — "),
          "/my/time-off",
        )
      }),

      /*
        The organization's things. Each arrives only in its recipient's own
        room — the organization room gets ids, never these — so a name and an
        amount are only ever rendered for somebody task-service already decided
        may see that asset. Live half of the bell entry the server persisted.
      */
      subscribe<{ assetId?: string; assetName?: string; authorName?: string; category?: string }>("asset.expense_submitted", (d) => {
        add(
          "asset_expense",
          t("notifications.assetExpenseSubmitted", "An expense to confirm"),
          t("notifications.assetExpenseSubmittedBody", "{{author}} sent {{category}} for {{asset}}", {
            author: d.authorName ?? "", category: d.category ?? "", asset: d.assetName ?? "",
          }),
          d.assetId ? `/assets/${d.assetId}` : "/assets",
        )
      }),
      subscribe<{ assetId?: string; assetName?: string; category?: string; decision?: string; note?: string | null }>(
        "asset.expense_decided",
        (d) => {
        const accepted = d.decision === "accept"
        add(
          "asset_expense_decided",
          accepted
            ? t("notifications.assetExpenseAccepted", "Expense accepted")
            : t("notifications.assetExpenseRefused", "Expense refused"),
          // The reason travels with a refusal — a bare "no" teaches nothing.
          [[d.category, d.assetName].filter(Boolean).join(" · "), accepted ? null : d.note].filter(Boolean).join(" — "),
          d.assetId ? `/assets/${d.assetId}` : "/assets",
        )
      }),
      subscribe<{ assetId?: string; assetName?: string; direction?: "to" | "from" }>("asset.handed_over", (d) => {
        const toMe = d.direction !== "from"
        add(
          "asset_handover",
          toMe
            ? t("notifications.assetHandedOver", "Handed over to you")
            : t("notifications.assetHandedBack", "Handed back"),
          toMe
            ? t("notifications.assetHandedOverBody", "{{asset}} is now with you", { asset: d.assetName ?? "" })
            : t("notifications.assetHandedBackBody", "{{asset}} was handed back", { asset: d.assetName ?? "" }),
          d.assetId ? `/assets/${d.assetId}` : "/assets",
        )
      }),

      // Join request events
      subscribe<JoinRequestEventPayload>("join_request_submitted", (d) => {
        add("join_request", t("notifications.joinRequest"), d.userName || d.userEmail || "", "/approvals?kind=join")
      }),
      subscribe<JoinRequestEventPayload>("join_request_approved", (d) => {
        add("join_approved", t("notifications.joinApproved"), d.organizationName || "", "/members")
      }),
      subscribe<JoinRequestEventPayload>("join_request_rejected", (d) => {
        add("join_rejected", t("notifications.joinRejected"), d.reason || "", "/join-requests")
      }),

      // Attendance events
      subscribe<AttendanceEventPayload>("attendance.clockIn", (d) => {
        const { name, place } = attendanceInfo(d, t)
        add(
          "clock_in",
          name || t("notifications.clockIn"),
          [t("notifications.clockInAction", "Clocked in"), place].filter(Boolean).join(" · "),
          attendanceHref)
      }),
      subscribe<AttendanceEventPayload>("attendance.clockOut", (d) => {
        const { name, place } = attendanceInfo(d, t)
        add(
          "clock_out",
          name || t("notifications.clockOut"),
          [t("notifications.clockOutAction", "Clocked out"), place].filter(Boolean).join(" · "),
          attendanceHref)
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

  return {
    openChatWith,
    t,
    router,
    notifications,
    setNotifications,
    open,
    setOpen,
    isConnected,
  }
}

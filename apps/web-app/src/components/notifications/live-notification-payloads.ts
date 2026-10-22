import { personName } from "@hbcfield/shared/client"
import type { TFunction } from "i18next"
import type { TaskEventPayload } from "@/types/socket-events"

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

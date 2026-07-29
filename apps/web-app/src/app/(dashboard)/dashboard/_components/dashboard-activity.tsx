import React from "react"
import i18n from "@/i18n"
import type { Task, OrgMember } from "@/lib/api"
import type { TimeEntry } from "@hbcfield/shared"
import type { LiveEvent, PendingAction } from "@/components/dashboard"
import { AVATAR_COLORS, getInitials, getAvatarColor, isClockedIn, timeAgo } from "./helpers"

// Single source of truth for how a task status maps to a feed dot + verb.
const STATUS_DOT: Record<string, LiveEvent["dot"]> = {
  IN_PROGRESS: "green",
  EN_ROUTE: "blue",
  ARRIVED: "green",
  COMPLETED: "blue",
  BLOCKED: "red",
  ASSIGNED: "amber",
  ACCEPTED: "green",
  NEW: "purple",
  CANCELED: "red",
}

// Statuses that have a dedicated action verb. Resolved via i18n at call time so
// the verb follows the active language (and recomputes on language change).
const STATUS_ACTION_KEYS = new Set([
  "IN_PROGRESS", "EN_ROUTE", "ARRIVED", "COMPLETED", "BLOCKED", "ASSIGNED", "ACCEPTED", "NEW", "CANCELED",
])
const statusAction = (status: string): string =>
  STATUS_ACTION_KEYS.has(status)
    ? i18n.t(`dashboard.activity.actions.${status}`)
    : i18n.t("dashboard.activity.actions.updated")

const shortName = (first?: string, last?: string) => `${first ?? ""} ${last?.[0] ?? ""}.`.trim()

/**
 * Build the "Recent Activity" feed by MERGING task status-changes and today's
 * clock-in/out events, then sorting the whole thing reverse-chronologically.
 * (The old inline version pushed tasks then clocks and never sorted, so the feed
 * wasn't actually time-ordered and clock events got truncated.)
 */
export function buildRecentActivity(opts: {
  tasks: Task[]
  todayEntries: TimeEntry[]
  memberMap: Map<string, OrgMember>
  limit?: number
}): LiveEvent[] {
  const { tasks, todayEntries, memberMap, limit = 12 } = opts
  const items: Array<{ ts: number; event: LiveEvent }> = []

  for (const task of tasks) {
    const a = task.assignedTo
    const name = a ? shortName(a.firstName, a.lastName) : i18n.t("dashboard.activity.someone")
    items.push({
      ts: new Date(task.updatedAt).getTime(),
      event: {
        id: `task-${task.id}`,
        dot: STATUS_DOT[task.status] || "blue",
        message: (
          <>
            <strong>{name}</strong> {statusAction(task.status)} <strong>{task.title}</strong>
          </>
        ),
        time: timeAgo(task.updatedAt),
      },
    })
  }

  for (const entry of todayEntries) {
    const member = memberMap.get(entry.userId)
    const name = member
      ? shortName(member.firstName, member.lastName)
      : entry.user
        ? shortName(entry.user.firstName, entry.user.lastName)
        : i18n.t("dashboard.activity.someone")
    const locationName = entry.location?.name || i18n.t("dashboard.activity.aLocation")

    if (isClockedIn(entry)) {
      items.push({
        ts: new Date(entry.clockInAt).getTime(),
        event: {
          id: `clock-in-${entry.id}`,
          dot: "green",
          message: (<><strong>{name}</strong> {i18n.t("dashboard.activity.clockedInAt")} <strong>{locationName}</strong></>),
          time: timeAgo(entry.clockInAt),
        },
      })
    } else if (entry.clockOutAt) {
      items.push({
        ts: new Date(entry.clockOutAt).getTime(),
        event: {
          id: `clock-out-${entry.id}`,
          dot: "blue",
          message: (<><strong>{name}</strong> {i18n.t("dashboard.activity.clockedOutFrom")} <strong>{locationName}</strong></>),
          time: timeAgo(entry.clockOutAt),
        },
      })
    }
  }

  return items
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit)
    .map((i) => i.event)
}

// Friendly one-line summary for an attendance entry's flag reasons. Reason →
// i18n key; resolved at call time so labels follow the active language.
const FLAG_LABEL_KEYS: Record<string, string> = {
  OVERTIME: "overtime",
  MISSED_CLOCK_OUT: "missedClockOut",
  OUTSIDE_GEOFENCE_IN: "outsideGeofence",
  OUTSIDE_GEOFENCE_OUT: "outsideGeofence",
  LATE_ARRIVAL: "lateArrival",
  EARLY_DEPARTURE: "earlyDeparture",
  UNSCHEDULED_DAY: "unscheduledDay",
}

const flagSummary = (reasons?: string[]) =>
  reasons && reasons.length
    ? reasons
        .map((r) =>
          FLAG_LABEL_KEYS[r]
            ? i18n.t(`dashboard.activity.flags.${FLAG_LABEL_KEYS[r]}`)
            : r.replace(/_/g, " ").toLowerCase(),
        )
        .join(", ")
    : i18n.t("dashboard.activity.flags.needsReview")

/**
 * Things needing attention, most time-sensitive first:
 *   1. Attendance entries awaiting approval (payroll-blocking) — approve inline
 *      (green ✓); the red ✗ routes to the Approvals tab where a reason is captured.
 *   2. Blocked tasks + new unassigned tasks — `onView` opens the task.
 */
export function buildPendingActions(opts: {
  tasks: Task[]
  onView: (taskId: string) => void
  approvals?: TimeEntry[]
  onApproveEntry?: (entryId: string) => void
  onReviewApproval?: (entryId: string) => void
  limit?: number
}): PendingAction[] {
  const { tasks, onView, approvals = [], onApproveEntry, onReviewApproval, limit = 6 } = opts
  const actions: PendingAction[] = []

  for (const entry of approvals.slice(0, 3)) {
    const u = entry.user
    const name = u ? shortName(u.firstName, u.lastName) : i18n.t("dashboard.pending.worker")
    actions.push({
      id: `approval-${entry.id}`,
      initials: u ? getInitials(u.firstName, u.lastName) : "?",
      color: getAvatarColor(entry.userId || "x"),
      title: `${name} — ${i18n.t("dashboard.pending.needsApproval")}`,
      description: flagSummary(entry.flagReasons),
      onApprove: onApproveEntry ? () => onApproveEntry(entry.id) : undefined,
      onReject: onReviewApproval ? () => onReviewApproval(entry.id) : undefined,
    })
  }

  for (const task of tasks.filter((t) => t.status === "BLOCKED").slice(0, 3)) {
    const a = task.assignedTo
    actions.push({
      id: `blocked-${task.id}`,
      initials: a ? getInitials(a.firstName, a.lastName) : "?",
      color: getAvatarColor(a?.id || "x"),
      imageUrl: a?.avatarUrl || undefined,
      title: `${a ? shortName(a.firstName, a.lastName) : i18n.t("dashboard.pending.unassigned")} — ${i18n.t("dashboard.pending.blocked")}`,
      description: task.title,
      onApprove: () => onView(task.id),
    })
  }

  for (const task of tasks.filter((t) => t.status === "NEW" && !t.assignedToId).slice(0, 3)) {
    actions.push({
      id: `new-${task.id}`,
      initials: "?",
      color: AVATAR_COLORS[4]!,
      title: i18n.t("dashboard.pending.unassignedNewTask"),
      description: task.title,
      onApprove: () => onView(task.id),
    })
  }

  return actions.slice(0, limit)
}

import React from "react"
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

const STATUS_ACTION: Record<string, string> = {
  IN_PROGRESS: "started working on",
  EN_ROUTE: "en route to",
  ARRIVED: "arrived at",
  COMPLETED: "completed",
  BLOCKED: "blocked on",
  ASSIGNED: "was assigned to",
  ACCEPTED: "accepted",
  NEW: "created",
  CANCELED: "canceled",
}

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
    const name = a ? shortName(a.firstName, a.lastName) : "Someone"
    items.push({
      ts: new Date(task.updatedAt).getTime(),
      event: {
        id: `task-${task.id}`,
        dot: STATUS_DOT[task.status] || "blue",
        message: (
          <>
            <strong>{name}</strong> {STATUS_ACTION[task.status] || "updated"} <strong>{task.title}</strong>
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
        : "Someone"
    const locationName = entry.location?.name || "a location"

    if (isClockedIn(entry)) {
      items.push({
        ts: new Date(entry.clockInAt).getTime(),
        event: {
          id: `clock-in-${entry.id}`,
          dot: "green",
          message: (<><strong>{name}</strong> clocked in at <strong>{locationName}</strong></>),
          time: timeAgo(entry.clockInAt),
        },
      })
    } else if (entry.clockOutAt) {
      items.push({
        ts: new Date(entry.clockOutAt).getTime(),
        event: {
          id: `clock-out-${entry.id}`,
          dot: "blue",
          message: (<><strong>{name}</strong> clocked out from <strong>{locationName}</strong></>),
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

/**
 * Things needing attention: blocked tasks + new unassigned tasks. `onView` opens
 * the task (the single primary action — there's no meaningful "reject" for these,
 * so no dead X button).
 */
export function buildPendingActions(opts: {
  tasks: Task[]
  onView: (taskId: string) => void
  limit?: number
}): PendingAction[] {
  const { tasks, onView, limit = 5 } = opts
  const actions: PendingAction[] = []

  for (const task of tasks.filter((t) => t.status === "BLOCKED").slice(0, 3)) {
    const a = task.assignedTo
    actions.push({
      id: `blocked-${task.id}`,
      initials: a ? getInitials(a.firstName, a.lastName) : "?",
      color: getAvatarColor(a?.id || "x"),
      imageUrl: a?.avatarUrl || undefined,
      title: `${a ? shortName(a.firstName, a.lastName) : "Unassigned"} — Blocked`,
      description: task.title,
      onApprove: () => onView(task.id),
    })
  }

  for (const task of tasks.filter((t) => t.status === "NEW" && !t.assignedToId).slice(0, 3)) {
    actions.push({
      id: `new-${task.id}`,
      initials: "?",
      color: AVATAR_COLORS[4]!,
      title: "Unassigned — New Task",
      description: task.title,
      onApprove: () => onView(task.id),
    })
  }

  return actions.slice(0, limit)
}

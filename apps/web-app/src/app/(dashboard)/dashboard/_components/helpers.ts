import type { TimeEntry } from "@hbcfield/shared"
import type { Task } from "@/lib/api"
import type { RecentTask } from "@/components/dashboard"
import i18n from "i18next"

/**
 * Helper function to get greeting based on time of day
 */
export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return i18n.t("dashboard.greeting.morning")
  if (hour < 17) return i18n.t("dashboard.greeting.afternoon")
  return i18n.t("dashboard.greeting.evening")
}

// ── Avatar helpers (shared by the dashboard grid + activity feed) ─────────────

export const AVATAR_COLORS = [
  "linear-gradient(135deg, #6366f1, #8b5cf6)",
  "linear-gradient(135deg, #3b82f6, #06b6d4)",
  "linear-gradient(135deg, #10b981, #059669)",
  "linear-gradient(135deg, #f59e0b, #d97706)",
  "linear-gradient(135deg, #ef4444, #dc2626)",
  "linear-gradient(135deg, #ec4899, #db2777)",
  "linear-gradient(135deg, #8b5cf6, #a855f7)",
  "linear-gradient(135deg, #14b8a6, #0d9488)",
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function getAvatarColor(id: string): string {
  return AVATAR_COLORS[hashString(id) % AVATAR_COLORS.length]!
}

// ── Attendance / time helpers ─────────────────────────────────────────────────

/** Currently clocked in (no clock-out yet). */
export function isClockedIn(entry: TimeEntry): boolean {
  return entry.status === "CLOCKED_IN" && !entry.clockOutAt
}

/**
 * Time elapsed since a date, human readable.
 * Delegates to the single shared implementation (audit MD-E1) — this used to be
 * one of four separate copies, each with its own granularity and i18n namespace.
 */
export { formatTimeAgo as timeAgo } from "@/lib/format-date"

/** Map a Task to the compact RecentTask shape used by the dashboard list. */
export function toRecentTask(tk: Task): RecentTask {
  return {
    id: tk.id,
    title: tk.title,
    status: tk.status,
    priority: tk.priority || "MEDIUM",
    dueDate: tk.dueDate ? new Date(tk.dueDate) : undefined,
    location: tk.locationAddress || undefined,
    createdAt: new Date(tk.updatedAt || Date.now()),
  }
}

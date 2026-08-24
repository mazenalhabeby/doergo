import type { TimeEntry } from "@hbcfield/shared"
import i18n from "@/i18n"

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

export function getInitials(firstName?: string, lastName?: string): string {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase()
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
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
 * Today's date as YYYY-MM-DD in the VIEWER's timezone.
 *
 * Must not go through `toISOString()`, which formats in UTC: east of Greenwich
 * that returns yesterday's date until the UTC day rolls over (before 02:00 in
 * GMT+2), and west of it returns tomorrow's during the evening. The value keys
 * the attendance query, so a UTC date asks the server for the wrong day.
 */
export function getTodayString(): string {
  const now = new Date()
  const month = `${now.getMonth() + 1}`.padStart(2, "0")
  const day = `${now.getDate()}`.padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * Time elapsed since a date, human readable.
 * Delegates to the single shared implementation (audit MD-E1) — this used to be
 * one of four separate copies, each with its own granularity and i18n namespace.
 */
export { formatTimeAgo as timeAgo } from "@/lib/format-date"

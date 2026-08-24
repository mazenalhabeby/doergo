import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// =============================================================================
// DATE FORMATTING
// =============================================================================

// Date and time formatting lives in `lib/format-date.ts` — import it from there.
//
// It is NOT re-exported here on purpose: format-date imports the i18n instance,
// and `cn` (this file) is imported by almost every component including
// server-rendered ones. Re-exporting made every one of them pull react-i18next,
// and `next build` failed collecting page data with
// "(0, e.createContext) is not a function". tsc and jest both passed — only the
// production build caught it.

// =============================================================================
// CLOCK FORMAT (per-user 12h / 24h preference — see useTimeFormat hook)
// =============================================================================

export type TimeFormatPref = "12h" | "24h"

/**
 * Format a time-of-day honoring the user's 12h/24h preference.
 * `hour12=true`  -> "2:30 PM"   `hour12=false` -> "14:30"
 * The explicit hour12 overrides the locale default, so the user's choice wins.
 */
/**
 * Human city/region label from an IANA timezone.
 * "America/New_York" -> "New York", "Europe/Vienna" -> "Vienna".
 */
export function cityFromTz(tz?: string | null): string {
  if (!tz) return ""
  const last = tz.split("/").pop() || tz
  return last.replace(/_/g, " ")
}

// Constructing an Intl.DateTimeFormat is comparatively expensive, and these
// formatters are called once PER ROW in attendance lists. Cache one instance per
// distinct (kind, locale, timeZone, hour12) combo — in practice a tiny set — so
// rendering a long list reuses formatters instead of rebuilding them each cell.
const _dtfCache = new Map<string, Intl.DateTimeFormat>()
function getDtf(kind: "t" | "dt", locale: string | undefined, hour12: boolean, timeZone?: string | null): Intl.DateTimeFormat {
  const key = `${kind}|${locale || ""}|${hour12 ? 1 : 0}|${timeZone || ""}`
  let fmt = _dtfCache.get(key)
  if (!fmt) {
    const base: Intl.DateTimeFormatOptions =
      kind === "t"
        ? { hour: hour12 ? "numeric" : "2-digit", minute: "2-digit", hour12 }
        : { month: "short", day: "numeric", hour: hour12 ? "numeric" : "2-digit", minute: "2-digit", hour12 }
    // With a timeZone, append the SHORT zone name (EST, CET, …) via Intl —
    // DST-aware, and it falls back to a GMT offset (GMT+5:30) for zones without
    // a common abbreviation. This is the standard, unambiguous label.
    fmt = new Intl.DateTimeFormat(
      locale || undefined,
      timeZone ? { ...base, timeZone, timeZoneName: "short" } : base,
    )
    _dtfCache.set(key, fmt)
  }
  return fmt
}

export function formatTimeOfDay(
  input: string | number | Date,
  hour12: boolean,
  locale?: string,
  timeZone?: string | null,
): string {
  const d = input instanceof Date ? input : new Date(input)
  if (isNaN(d.getTime())) return ""
  try {
    // The short zone label (e.g. "EST") is included by the formatter itself.
    return getDtf("t", locale, hour12, timeZone).format(d)
  } catch {
    // Invalid timezone → fall back to the local zone with no label.
    return getDtf("t", locale, hour12).format(d)
  }
}

/**
 * Format a date + time-of-day honoring the 12h/24h preference.
 * e.g. hour12 -> "Jan 15, 2:30 PM"   24h -> "Jan 15, 14:30"
 */
export function formatDateTimeOf(
  input: string | number | Date,
  hour12: boolean,
  locale?: string,
  timeZone?: string | null,
): string {
  const d = input instanceof Date ? input : new Date(input)
  if (isNaN(d.getTime())) return ""
  try {
    return getDtf("dt", locale, hour12, timeZone).format(d)
  } catch {
    return getDtf("dt", locale, hour12).format(d)
  }
}

/** date-fns time token for the current preference: "h:mm a" (12h) or "HH:mm" (24h). */
export function clockToken(hour12: boolean): string {
  return hour12 ? "h:mm a" : "HH:mm"
}

// =============================================================================
// ZONE-AWARE <input type="datetime-local"> CONVERSION
// A datetime-local input is a bare wall-clock string ("2026-08-05T06:00") with no
// zone. To edit an entry in ITS location's zone (not the admin's browser zone) we
// convert both ways against an explicit IANA tz. Same double-pass Intl-offset
// technique the backend shift resolver uses (handles DST boundaries).
// =============================================================================

const _offsetDtfCache = new Map<string, Intl.DateTimeFormat>()
function getOffsetDtf(tz: string): Intl.DateTimeFormat {
  let fmt = _offsetDtfCache.get(tz)
  if (!fmt) {
    // en-US is load-bearing: the parts below are parsed back out as numbers, so
    // the locale must stay one whose formatting we control. Not a missed i18n fix.
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    _offsetDtfCache.set(tz, fmt)
  }
  return fmt
}

// Offset (ms) of `tz` at the given UTC instant: (that instant's wall clock read
// as if it were UTC) − the instant itself. East-of-UTC is positive.
function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = getOffsetDtf(tz).formatToParts(new Date(utcMs))
  const m: Record<string, number> = {}
  for (const p of parts) if (p.type !== "literal") m[p.type] = Number(p.value)
  const asUtc = Date.UTC(m.year, m.month - 1, m.day, m.hour % 24, m.minute, m.second || 0)
  return asUtc - utcMs
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * UTC ISO string → wall-clock "yyyy-MM-ddTHH:mm" AS SEEN in `tz` (for the input
 * value). No tz → browser-local. Empty/invalid → "".
 */
export function utcToZonedInput(iso?: string | null, tz?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  if (!tz) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  }
  try {
    const parts = getOffsetDtf(tz).formatToParts(d)
    const m: Record<string, number> = {}
    for (const p of parts) if (p.type !== "literal") m[p.type] = Number(p.value)
    return `${m.year}-${pad2(m.month)}-${pad2(m.day)}T${pad2(m.hour % 24)}:${pad2(m.minute)}`
  } catch {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  }
}

/**
 * Wall-clock "yyyy-MM-ddTHH:mm" interpreted IN `tz` → UTC ISO string. No tz →
 * browser-local (native Date). Empty/invalid → "".
 */
export function zonedInputToUtc(wall?: string | null, tz?: string | null): string {
  if (!wall) return ""
  const [datePart, timePart] = wall.split("T")
  if (!datePart || !timePart) return ""
  const [y, mo, d] = datePart.split("-").map(Number)
  const [h, mi] = timePart.split(":").map(Number)
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return ""
  if (!tz) {
    const local = new Date(y, mo - 1, d, h, mi)
    return isNaN(local.getTime()) ? "" : local.toISOString()
  }
  try {
    // Treat the wall time as UTC, then subtract the zone offset. A second pass
    // corrects the rare case where the guess and true instant straddle a DST flip.
    const guess = Date.UTC(y, mo - 1, d, h, mi)
    const off1 = tzOffsetMs(guess, tz)
    let utc = guess - off1
    const off2 = tzOffsetMs(utc, tz)
    if (off2 !== off1) utc = guess - off2
    return new Date(utc).toISOString()
  } catch {
    const local = new Date(y, mo - 1, d, h, mi)
    return isNaN(local.getTime()) ? "" : local.toISOString()
  }
}

/**
 * Format a raw "HH:MM" (or "HH:MM:SS") schedule string for display, honoring the
 * 12h/24h preference. Schedules are stored as plain wall-clock strings, not dates.
 * "17:30" -> "5:30 PM" (12h) or "17:30" (24h).
 */
export function formatClockString(hhmm: string | null | undefined, hour12: boolean): string {
  if (!hhmm) return ""
  const [hStr, mStr] = hhmm.split(":")
  const h = Number(hStr)
  const m = Number(mStr)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
  if (!hour12) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  }
  const period = h >= 12 ? "PM" : "AM"
  const displayHour = h % 12 || 12
  return `${displayHour}:${String(m).padStart(2, "0")} ${period}`
}

/**
 * Format duration in seconds to human-readable format
 * e.g., 3665 -> "1h 1m 5s", 125 -> "2m 5s", 45 -> "45s"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return "0s"

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)

  return parts.join(" ")
}

/**
 * Format duration from milliseconds to human-readable format
 * e.g., 3665000 -> "1h 1m", 125000 -> "2m 5s"
 */
export function formatDurationMs(ms: number): string {
  return formatDuration(Math.floor(ms / 1000))
}

/**
 * Format duration from minutes to human-readable format
 * e.g., 90 -> "1h 30m", 45 -> "45m"
 */
export function formatDurationMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "-"
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  return `${hours}h ${mins}m`
}

/**
 * Format distance in meters to human-readable format
 * e.g., 1500 -> "1.5 km", 500 -> "500 m"
 */
export function formatDistance(meters: number): string {
  if (meters < 0) return "0 m"

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`
  }
  return `${Math.round(meters)} m`
}

// =============================================================================
// TASK HELPERS
// =============================================================================

/**
 * Generate a display-friendly request ID from a task
 * Uses first 3 letters of org name as prefix (e.g., "ACM-2026-K8U")
 * Falls back to "REQ" if no org name provided
 */
export function getRequestId(task: { id: string; createdAt: string }, orgName?: string): string {
  const year = new Date(task.createdAt).getFullYear()
  const idPart = task.id.slice(-3).toUpperCase()
  const prefix = orgName
    ? orgName.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase()
    : 'REQ'
  return `${prefix}-${year}-${idPart}`
}

/**
 * Get initials from a name (e.g., "John Doe" -> "JD")
 */

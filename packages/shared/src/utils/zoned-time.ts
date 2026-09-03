/**
 * Wall-clock ↔ instant, against an explicit zone.
 *
 * A shift is corrected in the SPACE's zone, never the editor's: a supervisor in
 * Vienna fixing a crew's hours in Helsinki types the times the crew worked. Both
 * clients need the same arithmetic — the web dialog and the mobile edit sheet —
 * and a second copy of a DST-aware conversion is the kind of duplicate that
 * drifts silently, by exactly one hour, twice a year.
 *
 * The double-pass Intl-offset technique matches the backend shift resolver.
 */
// =============================================================================
// ZONE-AWARE DATETIME-LOCAL INPUT CONVERSION
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
  const m = readParts(getOffsetDtf(tz), new Date(utcMs))
  const asUtc = Date.UTC(m.year, m.month - 1, m.day, m.hour % 24, m.minute, m.second)
  return asUtc - utcMs
}

/**
 * The formatter's parts as plain numbers.
 *
 * Written out rather than indexed ad hoc: the shared package compiles with
 * `noUncheckedIndexedAccess`, and a missing part here would otherwise become a
 * silent NaN in somebody's clock-in time.
 */
function readParts(dtf: Intl.DateTimeFormat, at: Date) {
  const m: Record<string, number> = {}
  for (const p of dtf.formatToParts(at)) if (p.type !== "literal") m[p.type] = Number(p.value)
  return {
    year: m.year ?? 0,
    month: m.month ?? 1,
    day: m.day ?? 1,
    hour: m.hour ?? 0,
    minute: m.minute ?? 0,
    second: m.second ?? 0,
  }
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
    const m = readParts(getOffsetDtf(tz), d)
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
  const [y = NaN, mo = NaN, d = NaN] = datePart.split("-").map(Number)
  const [h = NaN, mi = NaN] = timePart.split(":").map(Number)
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


/**
 * Wall-clock ↔ instant, against an explicit zone.
 *
 * A shift is corrected in the SPACE's zone, never the editor's: a supervisor in
 * Vienna fixing a crew's hours in Helsinki types the times the crew worked. Both
 * clients need the same arithmetic — the web dialog and the mobile edit sheet —
 * and a second copy of a DST-aware conversion is the kind of duplicate that
 * drifts silently, by exactly one hour, twice a year.
 *
 * The double-pass Intl-offset technique matches the backend shift resolver —
 * and the offset itself IS the backend's (`tzOffsetMs` in attendance/zoned-time),
 * imported rather than copied: this file kept a private second copy of it.
 */
import { zonedWallTimeToUtc } from "../attendance/zoned-time"
import { pad2, zoneFormatter, zonedParts } from "./zone-parts"

// =============================================================================
// ZONE-AWARE DATETIME-LOCAL INPUT CONVERSION
// A datetime-local input is a bare wall-clock string ("2026-08-05T06:00") with no
// zone. To edit an entry in ITS location's zone (not the admin's browser zone) we
// convert both ways against an explicit IANA tz. Same double-pass Intl-offset
// technique the backend shift resolver uses (handles DST boundaries).
// =============================================================================


/**
 * UTC ISO string → wall-clock "yyyy-MM-ddTHH:mm" AS SEEN in `tz` (for the input
 * value). No tz → browser-local. Empty/invalid → "".
 */
export function utcToZonedInput(iso?: string | null, tz?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  if (tz) {
    try {
      const m = zonedParts(d, tz)
      return `${m.year}-${pad2(m.month)}-${pad2(m.day)}T${pad2(m.hour)}:${pad2(m.minute)}`
    } catch {
      /* unknown zone — the browser's own clock below */
    }
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
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
  if (tz) {
    try {
      // An unknown zone throws here and falls back to browser-local below (the
      // shared offset reads an invalid zone as UTC, which is not what an input wants).
      zoneFormatter(tz)
      return zonedWallTimeToUtc(datePart, h, mi, tz).toISOString()
    } catch {
      /* the browser's own clock below */
    }
  }
  const local = new Date(y, mo - 1, d, h, mi)
  return isNaN(local.getTime()) ? "" : local.toISOString()
}

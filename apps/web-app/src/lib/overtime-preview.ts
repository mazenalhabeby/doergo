import { type TimeEntry } from "@/lib/api"

/**
 * What adding N minutes of overtime to a closed shift will do — the numbers the
 * dialog shows before anyone agrees to it.
 *
 * Overtime runs from the shift END, never from the moment it is approved, and
 * never counts past the clock-out: that is the server's rule
 * (`overtimeEndFor` + counted time), repeated here only to preview it.
 */
export interface OvertimePreview {
  /** Minutes the member stayed past the shift end (0 when they left on time). */
  pastEnd: number
  /** Sensible starting value: the time they actually stayed. */
  suggested: number
  /** When counted time will end. */
  countedUntil: Date
  /** Counted minutes now, and after. Null when the entry carries none. */
  countedBefore: number | null
  countedAfter: number | null
}

const MINUTE = 60_000

export function canAddOvertime(entry: TimeEntry): boolean {
  return entry.status === "CLOCKED_OUT" && !!entry.clockOutAt && !!entry.expectedClockOutAt
}

export function overtimePreview(entry: TimeEntry, minutes: number): OvertimePreview | null {
  if (!canAddOvertime(entry)) return null
  const out = Date.parse(entry.clockOutAt as string)
  const end = Date.parse(entry.expectedClockOutAt as string)
  const pastEnd = Math.max(0, Math.round((out - end) / MINUTE))
  const safe = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0

  const endBefore = Math.min(out, end)
  const endAfter = Math.min(out, end + safe * MINUTE)
  const counted = entry.paidMinutes ?? null
  return {
    pastEnd,
    suggested: pastEnd > 0 ? pastEnd : 30,
    countedUntil: new Date(endAfter),
    countedBefore: counted,
    countedAfter: counted == null ? null : counted + Math.round((endAfter - endBefore) / MINUTE),
  }
}

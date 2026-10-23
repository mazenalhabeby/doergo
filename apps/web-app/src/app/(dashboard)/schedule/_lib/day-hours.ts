import { parseRequestInput, REQUEST_LIMITS } from "@hbcfield/shared/client"

/*
  What the "Change hours for this day" form says about two times, before saving
  (docs/plans/time-counting-model.md, phase 2). Validity is the SHARED request
  parser — the one the server runs — so the form never accepts what saving refuses.
  An end at or before the start is the next morning (a night), at most 16 hours.
*/

const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5))

/** Minutes from `start` to `end`, a night rolling over to the next morning. */
export function spanMinutes(start: string, end: string): number {
  const d = mins(end) - mins(start)
  return d <= 0 ? d + 1440 : d
}

/** A wall time moved by some minutes, wrapping round midnight. */
export function shiftTime(hm: string, by: number): string {
  const m = (((mins(hm) + by) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

export type DayHoursCheck =
  { ok: true; minutes: number; night: boolean } | { ok: false; why: "MISSING" | "SAME" | "TOO_LONG"; minutes?: number }

export function checkDayHours(day: string, start: string, end: string): DayHoursCheck {
  if (!start || !end) return { ok: false, why: "MISSING" }
  if (start === end) return { ok: false, why: "SAME" }
  const parsed = parseRequestInput({ kind: "HOURS", startDate: day, startTime: start, endTime: end })
  const minutes = spanMinutes(start, end)
  if (!parsed.ok)
    return { ok: false, why: minutes > REQUEST_LIMITS.HOURS_MAX_OVERNIGHT_MINUTES ? "TOO_LONG" : "MISSING", minutes }
  return { ok: true, minutes, night: mins(end) <= mins(start) }
}

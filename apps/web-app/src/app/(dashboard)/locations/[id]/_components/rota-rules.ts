import { type ShiftAssignment, ShiftRecurrence } from "@hbcfield/shared/client"

/** The rota's pure rules: which day an assignment applies on, double bookings, and the recurrence badge colours. */

// 0=Sun..6=Sat to match backend daysOfWeek.
export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

/**
 * Does an assignment apply on a given calendar day? Resolves the recurrence
 * against the effective window. Date comparisons are done on yyyy-MM-dd strings
 * to sidestep timezone drift (matches how the day is displayed to the admin).
 */
export function assignmentAppliesOn(a: ShiftAssignment, day: Date, dayStr: string): boolean {
  const from = a.effectiveFrom?.slice(0, 10)
  const to = a.effectiveTo?.slice(0, 10)
  if (from && dayStr < from) return false
  if (to && dayStr > to) return false
  switch (a.recurrence) {
    case ShiftRecurrence.DAILY:
      return true
    case ShiftRecurrence.WEEKLY:
      return a.daysOfWeek?.includes(day.getDay()) ?? false
    case ShiftRecurrence.MONTHLY:
      return a.daysOfMonth?.includes(day.getDate()) ?? false
    case ShiftRecurrence.ONE_OFF:
      return a.dates?.some((d) => d.slice(0, 10) === dayStr) ?? false
    default:
      return false
  }
}

/** "HH:MM" → minutes since midnight. */
function hhmmToMin(hhmm?: string): number {
  if (!hhmm) return 0
  const [h, m] = hhmm.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** A shift's [start, end) window in minutes; night shifts extend past 1440. */
function shiftWindow(shift?: { startLocal: string; endLocal: string; crossesMidnight?: boolean }): [number, number] {
  if (!shift) return [0, 0]
  const s = hhmmToMin(shift.startLocal)
  let e = hhmmToMin(shift.endLocal)
  if (shift.crossesMidnight || e <= s) e += 1440
  return [s, e]
}

/** Do any two of a day's assignments have overlapping shift times? */
export function cellHasConflict(cell: ShiftAssignment[]): boolean {
  for (let i = 0; i < cell.length; i++) {
    for (let j = i + 1; j < cell.length; j++) {
      const [s1, e1] = shiftWindow(cell[i].shift)
      const [s2, e2] = shiftWindow(cell[j].shift)
      if (s1 < e2 && s2 < e1) return true
    }
  }
  return false
}

// Semantic accent per recurrence type (light + dark tokens, no raw hex).
export const RECURRENCE_BADGE: Record<ShiftRecurrence, string> = {
  [ShiftRecurrence.DAILY]: "border-primary/30 bg-shell-accent-soft text-shell-accent",
  [ShiftRecurrence.WEEKLY]: "border-primary/30 bg-card text-shell-accent",
  [ShiftRecurrence.MONTHLY]:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300",
  [ShiftRecurrence.ONE_OFF]: "border-border bg-muted text-muted-foreground",
}

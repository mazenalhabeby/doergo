import type { QueryClient } from "@tanstack/react-query"

/**
 * Query keys that describe the SAME data from different angles.
 *
 * Time off is read under three keys — `employeeTimeOff` on a member's record,
 * `orgTimeOff` on /attendance and /employees/availability, and `availability` on
 * the calendar, which computes from schedule + time-off + tasks. Each screen
 * invalidated only its own, so approving a day off in one place left the other two
 * showing it as still pending (audit MD-D1). Schedules had the same split against
 * the calendar (MD-D2).
 *
 * These helpers exist so a caller does not have to know which other screens read
 * the thing they just changed — that knowledge lives here, once.
 */

/** Everything that renders time-off records. */
export function invalidateTimeOff(qc: QueryClient, memberId?: string): void {
  qc.invalidateQueries({ queryKey: ["employeeTimeOff"] })
  qc.invalidateQueries({ queryKey: ["orgTimeOff"] })
  qc.invalidateQueries({ queryKey: ["availability"] })
  if (memberId) qc.invalidateQueries({ queryKey: ["employeeTimeOff", memberId] })
}

/**
 * Everything that renders a working week. The availability calendar derives from
 * the schedule, so it is stale the moment one is saved.
 */
export function invalidateSchedule(qc: QueryClient, memberId?: string): void {
  qc.invalidateQueries({ queryKey: ["employeeSchedule", ...(memberId ? [memberId] : [])] })
  qc.invalidateQueries({ queryKey: ["availability"] })
}

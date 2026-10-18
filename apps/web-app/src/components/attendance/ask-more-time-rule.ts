import type { TimeEntry } from "@hbcfield/shared/client"

/** Past the planned end and still on the clock — the moment to ask for more time. */
export function mayAskMoreTime(
  entry: Pick<TimeEntry, "expectedClockOutAt" | "reminderState"> | null | undefined,
  now = Date.now(),
) {
  if (!entry?.expectedClockOutAt) return false
  if (entry.reminderState === "OVERTIME_PENDING" || entry.reminderState === "OVERTIME_APPROVED") return false
  return new Date(entry.expectedClockOutAt).getTime() <= now
}

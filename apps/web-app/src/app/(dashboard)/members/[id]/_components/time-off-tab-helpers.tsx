"use client"

import { differenceInCalendarDays } from "date-fns"
import { type TimeOffStatus } from "@/lib/api"

/** TimeOffTab's module-level helpers, moved here unchanged so its sections can read them too. */
export const STATUS_PILLS: Record<
  TimeOffStatus,
  { labelKey: string; hex: string }
> = {
  PENDING: { labelKey: "common.pending", hex: "#ca8a04" },
  APPROVED: { labelKey: "common.approved", hex: "#16a34a" },
  REJECTED: { labelKey: "common.rejected", hex: "#dc2626" },
  CANCELED: { labelKey: "common.canceled", hex: "#64748b" },
}

/** What a request costs — its stored working-day count, or the span for rows from before the calendar. */
export function getDurationDays(start: string, end: string, workingDays?: number | null): number {
  return workingDays ?? differenceInCalendarDays(new Date(end), new Date(start)) + 1
}

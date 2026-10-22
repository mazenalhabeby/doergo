"use client"

import { format } from "date-fns"

/* The wallchart's day rules: cover per day, and which days rest. */

/** One workspace's cover for every visible day, from the server's own rule. */
export interface CoverRangeSpace {
  spaceId: string
  minCover: number
  rotaKnown: boolean
  days: Array<{ day: string; rostered: number; working: number }>
}

/** A rest day or a holiday in this workspace. Without calendar data yet, Saturday and Sunday. */
export function restingFn(restDays?: Set<string>, holidays?: Map<string, string>) {
  return (d: Date) => {
    const k = format(d, "yyyy-MM-dd")
    if (restDays) return restDays.has(k) || !!holidays?.has(k)
    return d.getDay() === 0 || d.getDay() === 6
  }
}

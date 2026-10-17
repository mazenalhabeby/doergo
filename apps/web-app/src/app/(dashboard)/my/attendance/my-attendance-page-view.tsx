"use client"

import { localDateKey, todayKey } from "@hbcfield/shared/client"
import type { useMyAttendancePage } from "./use-my-attendance-page"

/** What MyAttendancePage works out after its early returns, moved here unchanged; called from the same place. */
export function MyAttendancePageView(
  {
    locale,
    clockedIn,
    activeEntry,
    effectiveRange,
    entries
  }: {
    locale: ReturnType<typeof useMyAttendancePage>['locale'];
    clockedIn: ReturnType<typeof useMyAttendancePage>['clockedIn'];
    activeEntry: ReturnType<typeof useMyAttendancePage>['activeEntry'];
    effectiveRange: ReturnType<typeof useMyAttendancePage>['effectiveRange'];
    entries: ReturnType<typeof useMyAttendancePage>['entries']
  }) {
  /*
    The chosen window, as days rather than as a list.

    A column of rows answers "what did I do on the 3rd"; it does not answer "how
    did the month go", which is the question somebody opens their own shifts to
    ask. Both come from the one request — no second call for the totals.

    Bars stay readable at any length: a fortnight is drawn day by day, a quarter
    week by week. Thirty hairlines would be a texture, not information.
  */
  const window_ = (() => {
    const day = 86_400_000
    const from = new Date(`${effectiveRange.startDate}T00:00:00`)
    const to = new Date(`${effectiveRange.endDate}T00:00:00`)
    const dayCount = Math.max(1, Math.round((to.getTime() - from.getTime()) / day) + 1)
    const groupWeekly = dayCount > 16

    const buckets: { key: string; start: Date; minutes: number; label: string }[] = []
    for (let i = 0; i < dayCount; i += groupWeekly ? 7 : 1) {
      // Calendar steps, not 24h ones — a DST night is 23 or 25 hours long.
      const d = new Date(from)
      d.setDate(from.getDate() + i)
      buckets.push({
        key: localDateKey(d),
        start: d,
        minutes: 0,
        label: groupWeekly
          ? d.toLocaleDateString(locale, { day: "numeric", month: "short" })
          : d.toLocaleDateString(locale, { weekday: "narrow" }),
      })
    }

    let worked = 0
    let daysWorked = 0
    const seenDays = new Set<string>()
    for (const e of entries) {
      if (!e.clockInAt) continue
      const at = new Date(e.clockInAt)
      const dayKey = localDateKey(at)
      const offset = Math.round((new Date(`${dayKey}T00:00:00`).getTime() - from.getTime()) / day)
      if (offset < 0 || offset >= dayCount) continue
      const idx = groupWeekly ? Math.floor(offset / 7) : offset
      const to_ = e.clockOutAt ? new Date(e.clockOutAt).getTime() : Date.now()
      const mins = Math.max(0, (to_ - at.getTime()) / 60000)
      const bucket = buckets[idx]
      if (bucket) bucket.minutes += mins
      worked += mins
      if (!seenDays.has(dayKey)) {
        seenDays.add(dayKey)
        daysWorked++
      }
    }

    const peak = Math.max(60, ...buckets.map((b) => b.minutes))
    return { buckets, peak, worked, daysWorked, dayCount, groupWeekly, todayKey: todayKey() }
  })()

  /*
    How far through today's shift, when the shift has a known end.

    `expectedClockOutAt` is set at clock-in for a scheduled space and null for an
    open-hours one — so the ring appears where there is a real target and the
    elapsed time stands alone where there is not. Inventing an eight-hour default
    would draw a progress bar against a number nobody agreed to.
  */
  const shiftTarget = (() => {
    if (!clockedIn || !activeEntry?.clockInAt || !activeEntry.expectedClockOutAt) return null
    const start = new Date(activeEntry.clockInAt).getTime()
    const end = new Date(activeEntry.expectedClockOutAt).getTime()
    if (!(end > start)) return null
    return { start, totalMins: (end - start) / 60000 }
  })()

  return { window_, shiftTarget }
}

"use client"

import { useTranslation } from "react-i18next"
import { Clock } from "lucide-react"
import { useTimeFormat } from "@/hooks"
import { cn } from "@/lib/utils"
import { formatDuration, localDateKey, todayKey } from "@hbcfield/shared/client"
import type { TimeEntry } from "@hbcfield/shared"

/** The chosen window's hours, drawn as bars by day (or by week for a long window). */
export function HoursCard({
  effectiveRange,
  entries,
}: {
  effectiveRange: { startDate: string; endDate: string }
  entries: TimeEntry[]
}) {
  const { t } = useTranslation()
  const { locale } = useTimeFormat()
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
    The window, as bars — and the two numbers that describe it.

    "Hours in the last 60 entries" was a true number that answered no
    question anybody has. This says how the chosen stretch went, which day
    was heavy, and what a working day averaged.
  */
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Clock className="h-4 w-4 text-slate-400" />
        {t("attendance.my.hoursIn", "Hours worked")}
      </div>

      <div className="mt-2 flex items-baseline gap-3">
        <p className="text-2xl font-semibold tabular-nums text-foreground">{formatDuration(window_.worked)}</p>
        {window_.daysWorked > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("attendance.my.overDays", "{{days}} days · {{avg}} avg", {
              days: window_.daysWorked,
              avg: formatDuration(window_.worked / window_.daysWorked),
            })}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between gap-1.5" aria-hidden>
        {window_.buckets.map((b) => {
          const pct = b.minutes / window_.peak
          const isNow = !window_.groupWeekly && b.key === window_.todayKey
          return (
            <div key={b.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div className="flex h-16 w-full items-end">
                <div
                  className={cn(
                    "w-full rounded-md transition-[height] duration-700 ease-out",
                    b.minutes === 0 ? "bg-muted" : isNow ? "bg-primary" : "bg-primary/35",
                  )}
                  style={{ height: `${Math.max(b.minutes === 0 ? 4 : 10, pct * 100)}%` }}
                  title={`${b.label} · ${formatDuration(b.minutes)}`}
                />
              </div>
              <span
                className={cn(
                  "truncate text-[10px] leading-none",
                  isNow ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {b.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

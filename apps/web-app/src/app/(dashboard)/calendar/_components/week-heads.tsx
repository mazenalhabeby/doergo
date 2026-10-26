"use client"

import { useTranslation } from "react-i18next"
import type { DayKind } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { dateLocale } from "@/lib/format-date"

/** The week grid's day heads: the weekday over a big date, today on the jade tint, a holiday named in amber. */
export function WeekHeads({
  days,
  keys,
  today,
  dayKinds,
  holidayOf,
  cols,
}: {
  days: Date[]
  keys: string[]
  today: string
  dayKinds: Map<string, DayKind>
  holidayOf: Map<string, string>
  cols: string
}) {
  const { t } = useTranslation()
  return (
    <div className="grid pb-1.5" style={{ gridTemplateColumns: cols }}>
      <div />
      {days.map((d, i) => {
        const k = keys[i]!
        const kind = dayKinds.get(k)
        const rest = kind === "weekend" || kind === "off-rota"
        const isToday = k === today
        return (
          <div
            key={k}
            className={cn(
              "flex min-w-0 items-baseline gap-2 rounded-2xl px-2.5 pb-2 pt-2.5",
              isToday && "bg-shell-accent-soft",
            )}
          >
            <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {d.toLocaleDateString(dateLocale(), { weekday: "short" })}
            </span>
            <span
              className={cn(
                "text-2xl font-semibold leading-none tabular-nums tracking-[-0.03em] text-foreground",
                rest && "text-muted-foreground/60",
                isToday && "text-shell-accent",
              )}
            >
              {d.getDate()}
            </span>
            {holidayOf.get(k) && (
              <span className="ml-auto truncate text-[11px] font-semibold text-shell-warn" title={holidayOf.get(k)}>
                {t("calendar.holiday")}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import type { CalendarItem, DayKind } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { dateLocale } from "@/lib/format-date"
import { dayKey, itemsOn } from "../_lib/layout"
import { KIND_COLOR } from "../_lib/kinds"

interface Props {
  anchor: Date
  days: Date[]
  items: CalendarItem[]
  dayKinds: Map<string, DayKind>
  onSelect: (item: CalendarItem, el: HTMLElement) => void
  onOpenDay: (d: Date) => void
}

const MAX = 3

/** A month at a glance: dots and short lines, the day opens on click. */
export function MonthGrid({ anchor, days, items, dayKinds, onSelect, onOpenDay }: Props) {
  const { t } = useTranslation()
  const today = dayKey(new Date())
  const heads = useMemo(() => days.slice(0, 7).map((d) => d.toLocaleDateString(dateLocale(), { weekday: "short" })), [days])
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-7 border-b">
          {heads.map((h, i) => (
            <div key={i} className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{h}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const k = dayKey(d)
            const kind = dayKinds.get(k)
            const list = itemsOn(items, k).filter((x) => x.kind !== "shift")
            const out = d.getMonth() !== anchor.getMonth()
            const holiday = list.find((x) => x.kind === "holiday")
            return (
              <div
                key={k}
                className={cn(
                  "min-h-[112px] border-b border-l p-1.5 [&:nth-child(7n+1)]:border-l-0",
                  (kind === "weekend" || kind === "off-rota") && "bg-muted/40",
                  holiday && "bg-rose-500/[0.05]",
                  out && "opacity-50",
                )}
              >
                <button
                  type="button"
                  onClick={() => onOpenDay(d)}
                  className={cn(
                    "mb-1 grid h-7 min-w-7 place-items-center rounded-md px-1 text-sm tabular-nums transition hover:bg-accent",
                    k === today && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                  )}
                  aria-label={d.toLocaleDateString(dateLocale(), { dateStyle: "full" })}
                >
                  {d.getDate()}
                </button>
                <div className="space-y-0.5">
                  {list.slice(0, MAX).map((x) => (
                    <button
                      key={x.id + k}
                      type="button"
                      onClick={(e) => onSelect(x, e.currentTarget)}
                      style={{ "--k": KIND_COLOR[x.kind] } as React.CSSProperties}
                      className={cn(
                        "flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11.5px] hover:bg-accent",
                        x.allDay && "bg-[color-mix(in_oklab,var(--k)_14%,transparent)] font-medium",
                        x.kind === "leave" && x.status === "PENDING" && "bg-[repeating-linear-gradient(-45deg,color-mix(in_oklab,var(--k)_16%,transparent)_0_5px,transparent_5px_10px)]",
                      )}
                    >
                      {!x.allDay && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--k)]" />}
                      {!x.allDay && (
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {new Date(x.start).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      <span className="truncate">{x.title}</span>
                    </button>
                  ))}
                  {list.length > MAX && (
                    <button type="button" onClick={() => onOpenDay(d)} className="px-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                      {t("calendar.more", { count: list.length - MAX })}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

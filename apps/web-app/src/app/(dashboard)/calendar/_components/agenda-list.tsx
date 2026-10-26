"use client"

import { useTranslation } from "react-i18next"
import type { CalendarItem, DayKind } from "@hbcfield/shared/client"
import { CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import { dateLocale } from "@/lib/format-date"
import { dayKey, itemsOn } from "../_lib/layout"
import { KIND_COLOR } from "../_lib/kinds"

interface Props {
  days: Date[]
  items: CalendarItem[]
  dayKinds: Map<string, DayKind>
  onSelect: (item: CalendarItem, el: HTMLElement) => void
}

/** Two weeks as a list — what is next, without a grid to read. */
export function AgendaList({ days, items, dayKinds, onSelect }: Props) {
  const { t } = useTranslation()
  const today = dayKey(new Date())
  const rows = days
    .map((d) => ({ d, k: dayKey(d), list: itemsOn(items, dayKey(d)) }))
    .filter((r) => r.list.length || r.k === today)
  if (!rows.length) {
    return (
      <div className="grid place-items-center rounded-[22px] border border-border bg-card px-6 py-16 text-center shadow-shell">
        <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-medium">{t("calendar.agendaEmpty")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("calendar.agendaEmptyHint")}</p>
      </div>
    )
  }
  return (
    <div className="divide-y divide-border rounded-[22px] border border-border bg-card px-[18px] pb-3.5 pt-1.5 shadow-shell">
      {rows.map(({ d, k, list }) => {
        const kind = dayKinds.get(k)
        return (
          <div key={k} className="grid gap-4 py-3.5 sm:grid-cols-[110px_1fr]">
            <div className="flex items-baseline gap-2 sm:block">
              <div
                className={cn(
                  "text-[22px] font-semibold tabular-nums tracking-[-0.02em]",
                  k === today && "text-shell-accent",
                )}
              >
                {d.getDate()}
              </div>
              <div className="text-xs text-muted-foreground">
                {d.toLocaleDateString(dateLocale(), { weekday: "long", month: "short" })}
                {(kind === "weekend" || kind === "off-rota") && ` · ${t("calendar.dayOff")}`}
              </div>
            </div>
            <div className="space-y-1.5">
              {!list.length && <p className="py-1 text-sm text-muted-foreground">{t("calendar.nothingToday")}</p>}
              {list.map((x) => (
                <button
                  key={x.id + k}
                  type="button"
                  onClick={(e) => onSelect(x, e.currentTarget)}
                  style={{ "--k": KIND_COLOR[x.kind] } as React.CSSProperties}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-accent"
                >
                  <span className="size-2.5 shrink-0 rounded-full bg-[var(--k)]" />
                  <span className="w-24 shrink-0 text-[13px] tabular-nums text-muted-foreground">
                    {x.allDay
                      ? t("calendar.allDay")
                      : `${new Date(x.start).toLocaleTimeString(dateLocale(), {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}–${new Date(x.end).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" })}`}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold">{x.title}</span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">
                      {t(`calendar.kind.${x.kind}`)}
                      {x.location ? ` · ${x.location}` : ""}
                      {x.kind === "leave" && x.status === "PENDING" ? ` · ${t("calendar.requested")}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { CALENDAR_LAYERS, type CalendarItem, type CalendarLayer, type DayKind } from "@hbcfield/shared/client"
import { Check, ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { dateLocale } from "@/lib/format-date"
import { LAYER_COLOR } from "../_lib/kinds"
import { dayKey, monthGrid } from "../_lib/layout"
import { FeedCard } from "./feed-card"

interface Props {
  anchor: Date
  setAnchor: (d: Date) => void
  visibleKeys: Set<string>
  layers: CalendarLayer[]
  toggleLayer: (l: CalendarLayer) => void
  counts: Partial<Record<CalendarLayer, number>>
  dayKinds: Map<string, DayKind>
  holidayKeys: Set<string>
  offToday: CalendarItem[]
  onNew: () => void
}

/** The left rail: a new button, the month, the layers and who is off today. */
export function Rail({ anchor, setAnchor, visibleKeys, layers, toggleLayer, counts, dayKinds, holidayKeys, offToday, onNew }: Props) {
  const { t } = useTranslation()
  const grid = useMemo(() => monthGrid(anchor), [anchor])
  const today = dayKey(new Date())
  const heads = grid.slice(0, 7).map((d) => d.toLocaleDateString(dateLocale(), { weekday: "narrow" }))
  const shift = (n: number) => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + n, 1))

  return (
    <aside className="flex flex-col gap-6">
      <Button onClick={onNew} className="h-10 gap-2 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 font-semibold shadow-[0_8px_24px_-8px_rgba(37,99,235,.7)] hover:from-blue-500 hover:to-blue-700">
        <Plus className="h-4 w-4" />{t("calendar.new")}
      </Button>

      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {anchor.toLocaleDateString(dateLocale(), { month: "long", year: "numeric" })}
          </span>
          <span className="flex">
            <button type="button" aria-label={t("calendar.previous")} onClick={() => shift(-1)} className="rounded p-1 text-muted-foreground hover:bg-accent"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" aria-label={t("calendar.next")} onClick={() => shift(1)} className="rounded p-1 text-muted-foreground hover:bg-accent"><ChevronRight className="h-4 w-4" /></button>
          </span>
        </div>
        <div className="grid grid-cols-7 gap-y-0.5 text-center text-xs tabular-nums">
          {heads.map((h, i) => <span key={i} className="pb-1 text-[10.5px] font-medium text-muted-foreground/70">{h}</span>)}
          {grid.map((d) => {
            const k = dayKey(d)
            const kind = dayKinds.get(k)
            const out = d.getMonth() !== anchor.getMonth()
            return (
              <button
                key={k}
                type="button"
                onClick={() => setAnchor(d)}
                className={cn(
                  "relative mx-auto grid h-8 w-8 place-items-center rounded-lg transition hover:bg-accent",
                  out && "text-muted-foreground/40",
                  !out && (kind === "weekend" || kind === "off-rota") && "text-muted-foreground/70",
                  visibleKeys.has(k) && "bg-primary/10 text-foreground",
                  k === today && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                )}
              >
                {d.getDate()}
                {holidayKeys.has(k) && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-rose-500" />}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("calendar.layers")}</div>
        <div className="space-y-0.5">
          {CALENDAR_LAYERS.map((l) => {
            const on = layers.includes(l)
            return (
              <button
                key={l}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggleLayer(l)}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition hover:bg-accent", !on && "text-muted-foreground")}
              >
                <span
                  className="grid h-4 w-4 place-items-center rounded-[5px] ring-1 ring-inset ring-black/10"
                  style={on ? { background: LAYER_COLOR[l] } : { boxShadow: `inset 0 0 0 1.5px ${LAYER_COLOR[l]}` }}
                >
                  {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </span>
                {t(`calendar.layer.${l}`)}
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">{counts[l] ?? ""}</span>
              </button>
            )
          })}
        </div>
      </div>

      {offToday.length > 0 && (
        <div>
          <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("calendar.offToday")} · {offToday.length}</div>
          <div className="space-y-1">
            {offToday.slice(0, 8).map((x) => (
              <div key={x.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm">
                <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-500/15 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  {(x.personName ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{x.personName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t(`calendar.leaveType.${x.note ?? "VACATION"}`, x.note ?? "")}{x.status === "PENDING" ? ` · ${t("calendar.requested")}` : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <FeedCard />
    </aside>
  )
}

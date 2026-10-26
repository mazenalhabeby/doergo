"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { CALENDAR_LAYERS, type CalendarItem, type CalendarLayer, type DayKind } from "@hbcfield/shared/client"
import { Check, ChevronLeft, ChevronRight } from "lucide-react"
import { GroupLabel, Panel } from "@/components/page/page-kit"
import { UserAvatar } from "@/components/common/user-avatar"
import { cn } from "@/lib/utils"
import { dateLocale, formatMonthYear } from "@/lib/format-date"
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
}

/** The left rail: the month, the layers, who is off today and the phone feed — each its own card. */
export function Rail({
  anchor,
  setAnchor,
  visibleKeys,
  layers,
  toggleLayer,
  counts,
  dayKinds,
  holidayKeys,
  offToday,
}: Props) {
  const { t } = useTranslation()
  const grid = useMemo(() => monthGrid(anchor), [anchor])
  const today = dayKey(new Date())
  const heads = grid.slice(0, 7).map((d) => d.toLocaleDateString(dateLocale(), { weekday: "narrow" }))
  const shift = (n: number) => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + n, 1))

  return (
    <aside className="flex flex-col gap-3.5">
      <Panel as="div" className="p-3.5">
        <div className="mb-2 flex items-center gap-1">
          <b className="flex-1 text-sm font-semibold text-foreground">{formatMonthYear(anchor)}</b>
          <span className="flex">
            <button
              type="button"
              aria-label={t("calendar.previous")}
              onClick={() => shift(-1)}
              className="grid size-[30px] place-items-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={t("calendar.next")}
              onClick={() => shift(1)}
              className="grid size-[30px] place-items-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </span>
        </div>
        <div className="grid grid-cols-7 gap-y-0.5 text-center text-xs tabular-nums">
          {heads.map((h, i) => (
            <span key={i} className="py-1 text-[11px] font-semibold text-muted-foreground/80">
              {h}
            </span>
          ))}
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
                  "relative mx-auto grid h-[30px] w-full place-items-center rounded-[9px] text-[12.5px] text-foreground " +
                    "transition hover:bg-accent",
                  out && "text-muted-foreground/40",
                  !out && (kind === "weekend" || kind === "off-rota") && "text-muted-foreground/70",
                  visibleKeys.has(k) && "bg-shell-nav-on",
                  k === today && "font-semibold shadow-[inset_0_0_0_1.5px_var(--shell-accent)]",
                )}
              >
                {d.getDate()}
                {holidayKeys.has(k) && <span className="absolute bottom-[3px] size-1 rounded-full bg-shell-warn" />}
              </button>
            )
          })}
        </div>
      </Panel>

      <Panel as="div" className="p-3">
        <GroupLabel className="px-1.5 pt-0.5">{t("calendar.layers")}</GroupLabel>
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
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-[7px] text-[13.5px] text-foreground " +
                    "transition hover:bg-accent",
                  !on && "text-muted-foreground",
                )}
              >
                <span
                  className="grid h-4 w-4 place-items-center rounded-[5px] ring-1 ring-inset ring-black/10"
                  style={on ? { background: LAYER_COLOR[l] } : { boxShadow: `inset 0 0 0 1.5px ${LAYER_COLOR[l]}` }}
                >
                  {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </span>
                {t(`calendar.layer.${l}`)}
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">{counts[l] ?? ""}</span>
              </button>
            )
          })}
        </div>
      </Panel>

      {offToday.length > 0 && (
        <Panel as="div" className="p-3">
          <GroupLabel className="px-1.5 pt-0.5">
            {t("calendar.offToday")} · {offToday.length}
          </GroupLabel>
          <div className="space-y-0.5">
            {offToday.slice(0, 8).map((x) => (
              <div key={x.id} className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-[13.5px]">
                <UserAvatar
                  firstName={(x.personName ?? "?").split(" ")[0]}
                  lastName={(x.personName ?? "").split(" ").slice(1).join(" ")}
                  className="size-7"
                  soft
                />
                <span className="min-w-0">
                  <span className="block truncate">{x.personName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t(`calendar.leaveType.${x.note ?? "VACATION"}`, x.note ?? "")}
                    {x.status === "PENDING" ? ` · ${t("calendar.requested")}` : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <FeedCard />
    </aside>
  )
}

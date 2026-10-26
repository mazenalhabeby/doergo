"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { CalendarItem, DayKind } from "@hbcfield/shared/client"
import { Flag, MapPin, Video } from "lucide-react"
import { cn } from "@/lib/utils"
import { dateLocale } from "@/lib/format-date"
import { HOUR_PX, dayKey, inBand, layoutBand, layoutDay } from "../_lib/layout"
import { KIND_COLOR, tint, tintText } from "../_lib/kinds"
import { WeekHeads } from "./week-heads"

interface Props {
  days: Date[]
  items: CalendarItem[]
  dayKinds: Map<string, DayKind>
  selectedId: string | null
  onSelect: (item: CalendarItem, el: HTMLElement) => void
  onCreateAt: (start: Date) => void
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)

function timeLabel(d: Date) {
  return d.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" })
}

/** The day and week views: an all-day band of spanning bars over an hour grid. */
export function WeekGrid({ days, items, dayKinds, selectedId, onSelect, onCreateAt }: Props) {
  const { t } = useTranslation()
  const scroller = useRef<HTMLDivElement>(null)
  const keys = useMemo(() => days.map(dayKey), [days])
  const today = dayKey(new Date())
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  // Open on the working morning, not at midnight.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_PX - 8
  }, [])

  const band = useMemo(
    () =>
      layoutBand(
        items.filter((i) => inBand(i) && i.kind !== "shift"),
        keys,
      ),
    [items, keys],
  )
  const timed = useMemo(() => items.filter((i) => !inBand(i)), [items])
  const shifts = useMemo(() => timed.filter((i) => i.kind === "shift"), [timed])
  const placed = useMemo(
    () =>
      keys.map((k) =>
        layoutDay(
          timed.filter((i) => i.kind !== "shift"),
          k,
        ),
      ),
    [keys, timed],
  )
  const holidayOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of items)
      if (i.kind === "holiday") for (const k of keys) if (k >= i.start && k <= i.end) m.set(k, i.title)
    return m
  }, [items, keys])

  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`
  const nowTop = (now.getHours() + now.getMinutes() / 60) * HOUR_PX

  return (
    <div className="overflow-x-auto rounded-[22px] border border-border bg-card px-2.5 pb-3 pt-1.5 shadow-shell">
      <div className={cn(days.length > 1 && "min-w-[760px]")}>
        <WeekHeads days={days} keys={keys} today={today} dayKinds={dayKinds} holidayOf={holidayOf} cols={cols} />

        {/* All-day band */}
        {band.lanes > 0 && (
          <div
            className="grid gap-y-1 border-b border-border py-1.5"
            style={{ gridTemplateColumns: cols, gridTemplateRows: `repeat(${band.lanes}, 24px)` }}
          >
            <div
              className={
                "row-span-full pr-2 pt-1 text-right font-mono text-[10px] uppercase " + "text-muted-foreground/70"
              }
              style={{ gridRow: `1 / span ${band.lanes}` }}
            >
              {t("calendar.allDay")}
            </div>
            {band.bars.map((b) => {
              const pending = b.item.kind === "leave" && b.item.status === "PENDING"
              const estimated = b.item.kind === "holiday" && b.item.status === "ESTIMATED"
              return (
                <button
                  key={b.item.id}
                  type="button"
                  onClick={(e) => onSelect(b.item, e.currentTarget)}
                  style={
                    {
                      "--k": KIND_COLOR[b.item.kind],
                      gridColumn: `${b.col + 2} / span ${b.span}`,
                      gridRow: b.lane + 1,
                    } as React.CSSProperties
                  }
                  className={cn(
                    "mx-1 flex min-w-0 items-center gap-1.5 truncate rounded-[7px] px-2 " +
                      "text-left text-[11.5px] font-medium transition hover:brightness-110 " +
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    tint,
                    tintText,
                    pending &&
                      "bg-[repeating-linear-gradient(-45deg,color-mix(in_oklab,var(--k)_16%,transparent)_0_6px,transparent_6px_12px)] " +
                        "ring-[color-mix(in_oklab,var(--k)_55%,transparent)]",
                    estimated && "border border-dashed border-[color-mix(in_oklab,var(--k)_50%,transparent)]",
                    selectedId === b.item.id && "ring-2 ring-[var(--k)]",
                  )}
                  title={b.item.title}
                >
                  {b.item.kind === "holiday" && <Flag className="h-3 w-3 shrink-0" />}
                  <span className="truncate">
                    {b.item.kind === "leave"
                      ? `${b.item.title} · ${t(`calendar.leaveType.${b.item.note ?? "VACATION"}`, b.item.note ?? "")}`
                      : b.item.title}
                    {pending ? ` · ${t("calendar.requested")}` : ""}
                    {estimated ? ` · ${t("calendar.estimated")}` : ""}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Hours */}
        <div ref={scroller} className="relative max-h-[640px] overflow-y-auto">
          <div className="grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR_PX }}>
            <div className="relative">
              {HOURS.slice(1).map((h) => (
                <span
                  key={h}
                  className={"absolute right-2 -translate-y-1.5 font-mono text-[10px] " + "text-muted-foreground/70"}
                  style={{ top: h * HOUR_PX }}
                >
                  {String(h).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {days.map((d, i) => {
              const k = keys[i]!
              const kind = dayKinds.get(k)
              const rest = kind === "weekend" || kind === "off-rota"
              const holiday = kind === "holiday" || kind === "half-holiday"
              return (
                <div
                  key={k}
                  className={cn(
                    "relative border-l border-border [background-size:100%_48px]",
                    "bg-[linear-gradient(hsl(var(--border)/0.6)_1px,transparent_1px)]",
                    rest && "bg-muted/40",
                    holiday && "bg-[color-mix(in_srgb,var(--shell-warn)_9%,transparent)]",
                    k === today && "bg-[color-mix(in_srgb,var(--shell-accent)_4%,transparent)]",
                  )}
                  onDoubleClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const mins = Math.max(0, Math.floor(((e.clientY - rect.top) / HOUR_PX) * 2) * 30)
                    const start = new Date(d)
                    start.setHours(0, mins, 0, 0)
                    onCreateAt(start)
                  }}
                >
                  {/* The shift is a rail on the edge, so work stays readable on top of it. */}
                  {shifts
                    .filter((s) => dayKey(new Date(s.start)) === k)
                    .map((s) => {
                      const st = new Date(s.start),
                        en = new Date(s.end)
                      const top = (st.getHours() + st.getMinutes() / 60) * HOUR_PX
                      const h = Math.max(((en.getTime() - st.getTime()) / 3600000) * HOUR_PX, 8)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-label={`${s.title} ${timeLabel(st)}–${timeLabel(en)}`}
                          title={`${s.title} · ${timeLabel(st)}–${timeLabel(en)}${s.note ? ` · ${s.note}` : ""}`}
                          onClick={(e) => onSelect(s, e.currentTarget)}
                          className="absolute left-0.5 w-[3px] rounded-full bg-shell-accent opacity-70"
                          style={{ top, height: Math.min(h, 24 * HOUR_PX - top) }}
                        />
                      )
                    })}
                  {placed[i]!.map((p) => {
                    const st = new Date(p.item.start)
                    const short = p.height < 40
                    const width = `calc((100% - 14px) / ${p.cols})`
                    return (
                      <button
                        key={p.item.id}
                        type="button"
                        onClick={(e) => onSelect(p.item, e.currentTarget)}
                        style={
                          {
                            "--k": KIND_COLOR[p.item.kind],
                            top: p.top + 1,
                            height: p.height - 2,
                            left: `calc(8px + ${width} * ${p.col})`,
                            width: `calc(${width} - 2px)`,
                          } as React.CSSProperties
                        }
                        className={cn(
                          "absolute overflow-hidden rounded-[10px] px-2 text-left " +
                            "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition " +
                            "hover:-translate-y-px hover:shadow-md focus-visible:outline-none " +
                            "focus-visible:ring-2 focus-visible:ring-ring",
                          tint,
                          short ? "flex items-center gap-1.5 py-0" : "py-1.5",
                          p.item.status === "DECLINED" && "opacity-50 line-through",
                          selectedId === p.item.id &&
                            "ring-2 ring-[var(--k)] " +
                              "shadow-[0_0_0_4px_color-mix(in_oklab,var(--k)_20%,transparent)]",
                        )}
                      >
                        <time
                          className={cn("shrink-0 whitespace-nowrap font-mono text-[10.5px] font-medium", tintText)}
                        >
                          {timeLabel(st)}
                        </time>
                        <span
                          className={cn(
                            "block truncate text-[12px] font-semibold leading-tight text-foreground",
                            short && "min-w-0",
                          )}
                        >
                          {p.item.title}
                        </span>
                        {!short && p.height >= 62 && (p.item.location || p.item.meetingUrl) && (
                          <span className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                            {p.item.meetingUrl ? (
                              <Video className="h-3 w-3 shrink-0" />
                            ) : (
                              <MapPin className="h-3 w-3 shrink-0" />
                            )}
                            <span className="truncate">{p.item.location || t("calendar.online")}</span>
                          </span>
                        )}
                      </button>
                    )
                  })}
                  {k === today && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-shell-crit"
                      style={{ top: nowTop }}
                    >
                      <span className="absolute -left-1 -top-1 size-2.5 rounded-full bg-shell-crit" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

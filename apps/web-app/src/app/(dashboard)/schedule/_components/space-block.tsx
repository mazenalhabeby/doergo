"use client"

import { UserAvatar } from "@/components/common/user-avatar"
import { PENDING_STRIPES } from "@/components/attendance/time-styles"
import { personName } from "@hbcfield/shared/client"
import { format, parseISO } from "date-fns"
import { useTranslation } from "react-i18next"
import { Clock } from "lucide-react"
import { PopoverAnchor } from "@/components/ui/popover"
import type { OrgTimeOffRequest } from "@/lib/api"
import { cn } from "@/lib/utils"
import { isAbsence, requestDetail, requestKindLabelKey, requestKindOf } from "@/lib/requests"
import { REQUEST_KIND_ICON } from "@/components/requests/request-kind"
import { COVER_TONE, coverMark, coverShort } from "../_lib/cover-labels"
import { type CoverRangeSpace, restingFn } from "./wallchart-days"
import { SpaceCoverFooter } from "./space-cover-footer"

/** One workspace's block in the leave wallchart. */
export function SpaceBlock({
  restDays,
  holidays,
  title,
  minCover,
  rotaKnown,
  people,
  days,
  dayKeys,
  todayKey,
  template,
  barsByPerson,
  marksByPerson,
  cover,
  selected,
  selectedInThisSpace,
  onSelect,
  onPickDay,
  pickedKey,
}: {
  restDays?: Set<string>
  holidays?: Map<string, string>
  title: string
  minCover: number
  rotaKnown: boolean
  people: Array<{ id: string; firstName: string; lastName: string; specialty: string | null; position: string | null }>
  days: Date[]
  dayKeys: string[]
  todayKey: string
  template: React.CSSProperties
  barsByPerson: Map<string, OrgTimeOffRequest[]>
  marksByPerson: Map<string, OrgTimeOffRequest[]>
  cover?: CoverRangeSpace
  selected: OrgTimeOffRequest | null
  selectedInThisSpace: boolean
  onSelect: (id: string) => void
  /** Set for a leader with the rota permission: a person's day opens "Change hours for this day". */
  onPickDay?: (person: { id: string; firstName: string; lastName: string }, dayKey: string) => void
  /** `${personId}:${dayKey}` of the day whose form is open — the pop-over's anchor. */
  pickedKey?: string | null
}) {
  const { t } = useTranslation()
  if (!people.length) return null

  const isWeekend = restingFn(restDays, holidays)
  const dayCover = new Map((cover?.days ?? []).map((d) => [d.day, d]))

  /** Would the selected request take this day's count down? */
  const projected = (dayKey: string, working: number): number | null => {
    // Only leave moves the count — a remote day leaves the floor as it was.
    if (!selected || !selectedInThisSpace || !isAbsence(selected.kind)) return null
    if (dayKey < selected.startDate.slice(0, 10) || dayKey > selected.endDate.slice(0, 10)) return null
    const d = selected.cover?.days?.find((x) => x.day === dayKey)
    return d ? d.then : working
  }

  return (
    <>
      <div className="sticky left-0 flex items-center gap-2 border-y border-border bg-muted/70 px-4 py-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{title}</span>
        {minCover > 0 && (
          <span className="text-[11px] text-muted-foreground/70">
            {t("cover.chart.minimum", "· minimum cover {{n}}", { n: minCover })}
          </span>
        )}
        {!rotaKnown && (
          <span className="text-[10.5px] text-muted-foreground/60">{t("cover.noRota.badge", "no rota set")}</span>
        )}
      </div>

      {people.map((p) => {
        const bars = barsByPerson.get(p.id) ?? []
        const marks = marksByPerson.get(p.id) ?? []
        return (
          <div key={p.id} className="grid border-b border-border last:border-b-0" style={template}>
            <div className="sticky left-0 z-10 flex min-h-[2.9rem] items-center gap-2 border-r border-border bg-card px-3 py-1.5">
              <UserAvatar firstName={p.firstName} lastName={p.lastName} seed={p.id} className="size-[30px]" soft />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold leading-tight text-foreground">
                  {personName(p)}
                </span>
                <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                  {p.specialty || p.position || ""}
                </span>
              </span>
            </div>

            {days.map((d, i) => {
              const cell = cn("border-l border-border", isWeekend(d) && "bg-muted/60")
              if (!onPickDay) return <div key={d.toISOString()} className={cell} />
              const key = `${p.id}:${dayKeys[i]}`
              const button = (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => onPickDay(p, dayKeys[i]!)}
                  aria-label={t("dayHours.cellLabel", { name: personName(p), day: format(d, "EEE d MMM") })}
                  className={cn(
                    cell,
                    "group grid place-items-center text-primary transition-colors hover:bg-primary/10",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                    pickedKey === key && "bg-primary/10 ring-2 ring-inset ring-primary",
                  )}
                >
                  <Clock
                    className={cn(
                      "size-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
                      pickedKey === key && "opacity-100",
                    )}
                    aria-hidden
                  />
                </button>
              )
              return pickedKey === key ? (
                <PopoverAnchor asChild key={d.toISOString()}>
                  {button}
                </PopoverAnchor>
              ) : (
                button
              )
            })}

            {bars.map((bar) => {
              const from = bar.startDate.slice(0, 10)
              const to = bar.endDate.slice(0, 10)
              // Clip to what is on screen, so a request running past either edge
              // still draws — a bar that disappears when you page is a bar that
              // gets forgotten.
              if (to < dayKeys[0]! || from > dayKeys[dayKeys.length - 1]!) return null
              const startIdx = Math.max(0, dayKeys.indexOf(from) === -1 ? 0 : dayKeys.indexOf(from))
              const endIdx = dayKeys.indexOf(to) === -1 ? dayKeys.length - 1 : dayKeys.indexOf(to)
              const span = endIdx - startIdx + 1
              const pending = bar.status === "PENDING"
              const level = bar.cover?.level ?? "ok"
              const mark = pending ? coverMark(level) : ""

              const label =
                span >= 3
                  ? `${format(parseISO(bar.startDate), "d MMM")} – ${format(parseISO(bar.endDate), "d MMM")}`
                  : span >= 2
                    ? format(parseISO(bar.startDate), "d MMM")
                    : ""

              const tip = `${personName(p)} — ${format(parseISO(bar.startDate), "d MMM")}${
                from !== to ? ` – ${format(parseISO(bar.endDate), "d MMM")}` : ""
              }${pending ? ` · ${t("cover.chart.pendingTip", "pending — click to decide")}` : ` · ${t("common.approved")}`}${
                bar.cover ? ` · ${coverShort(bar.cover, t)}` : ""
              }`

              const common =
                "row-start-1 self-center mx-0.5 h-6 rounded-md px-1.5 flex items-center " +
                "gap-1 text-[11px] font-semibold whitespace-nowrap overflow-hidden"

              return pending ? (
                <button
                  key={bar.id}
                  type="button"
                  title={tip}
                  onClick={() => onSelect(bar.id)}
                  style={{ gridColumn: `${startIdx + 2} / ${endIdx + 3}` }}
                  className={cn(
                    common,
                    "z-[2] cursor-pointer text-shell-warn transition",
                    PENDING_STRIPES,
                    "hover:-translate-y-px hover:shadow-sm",
                    selected?.id === bar.id && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                    selected && selected.id !== bar.id && "opacity-40",
                  )}
                >
                  {mark && <span className={cn("text-[10px]", COVER_TONE[level].text)}>{mark}</span>}
                  {label}
                </button>
              ) : (
                <div
                  key={bar.id}
                  title={tip}
                  style={{ gridColumn: `${startIdx + 2} / ${endIdx + 3}` }}
                  className={cn(common, "z-[1] bg-primary/85 text-primary-foreground", selected && "opacity-40")}
                >
                  {label}
                </div>
              )
            })}

            {marks.map((m) => {
              const from = m.startDate.slice(0, 10)
              const to = m.endDate.slice(0, 10)
              if (to < dayKeys[0]! || from > dayKeys[dayKeys.length - 1]!) return null
              const startIdx = dayKeys.indexOf(from) === -1 ? 0 : dayKeys.indexOf(from)
              const endIdx = dayKeys.indexOf(to) === -1 ? dayKeys.length - 1 : dayKeys.indexOf(to)
              const pending = m.status === "PENDING"
              const k = requestKindOf(m.kind)
              const Icon = REQUEST_KIND_ICON[k]
              const detail = requestDetail(m, t)
              const tip = `${personName(
                p,
              )} — ${t(requestKindLabelKey(k))}${detail ? ` (${detail})` : ""} · ${format(parseISO(m.startDate), "d MMM")}${
                from !== to ? ` – ${format(parseISO(m.endDate), "d MMM")}` : ""
              } · ${pending ? t("cover.chart.pendingTip", "pending — click to decide") : t("common.approved")}`
              return (
                <button
                  key={m.id}
                  type="button"
                  title={tip}
                  aria-label={tip}
                  onClick={() => onSelect(m.id)}
                  style={{ gridColumn: `${startIdx + 2} / ${endIdx + 3}` }}
                  className={cn(
                    "row-start-1 z-[3] mx-0.5 mb-0.5 flex h-4 items-center gap-1 self-end " +
                      "overflow-hidden whitespace-nowrap rounded-full border bg-card px-1 " +
                      "text-[10px] font-medium transition hover:-translate-y-px",
                    pending
                      ? "border-dashed border-current text-shell-warn"
                      : "border-border text-muted-foreground",
                    selected?.id === m.id && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                    selected && selected.id !== m.id && "opacity-40",
                  )}
                >
                  <Icon className="size-2.5 shrink-0" aria-hidden />
                  {endIdx > startIdx && <span className="truncate">{t(requestKindLabelKey(k))}</span>}
                </button>
              )
            })}
          </div>
        )
      })}

      {/* On the floor — the count, then the verdict. Two rows because they are
          two different statements, and a manager should read a judgement rather
          than perform the subtraction themselves. */}
      {cover && (
        <SpaceCoverFooter
          minCover={minCover}
          days={days}
          template={template}
          isWeekend={isWeekend}
          dayCover={dayCover}
          projected={projected}
        />
      )}
    </>
  )
}

"use client"

import { useMemo } from "react"
import { format, isSameDay, parseISO } from "date-fns"
import { Users } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { FloorSpace, OrgTimeOffRequest } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { COVER_TONE, coverMark, coverShort } from "../_lib/cover-labels"

/** One workspace's cover for every visible day, from the server's own rule. */
export interface CoverRangeSpace {
  spaceId: string
  minCover: number
  rotaKnown: boolean
  days: Array<{ day: string; rostered: number; working: number }>
}

/**
 * The wallchart: people down the side, days across, leave drawn as bars.
 *
 * It replaces two tabs. Deciding leave used to mean reading a table of requests,
 * then switching to a calendar to work out who would be left — and the calendar
 * could not answer, because it drew only APPROVED leave and so never showed the
 * effect of the decision being made.
 *
 * Approved is SOLID, pending is HATCHED. Texture rather than hue, deliberately:
 * that leaves colour free to mean one thing only — how cover stands — so red on
 * this chart never has to be read twice.
 *
 * The footer numbers come from the server, not from arithmetic here. A count
 * computed in the browser would be a second implementation of "who is rostered",
 * and the day it disagreed with the verdict on the bar above it, nobody could
 * say which was right.
 */
export function LeaveWallchart({
  days,
  spaces,
  requests,
  cover,
  selectedId,
  onSelect,
  isLoading,
}: {
  days: Date[]
  spaces: FloorSpace[]
  requests: OrgTimeOffRequest[]
  cover: CoverRangeSpace[]
  selectedId: string | null
  onSelect: (id: string) => void
  isLoading: boolean
}) {
  const { t } = useTranslation()
  const dayKeys = useMemo(() => days.map((d) => format(d, "yyyy-MM-dd")), [days])
  const todayKey = format(new Date(), "yyyy-MM-dd")

  /** Leave that is still on the books, indexed by person. Decided-and-refused
   *  rows are history and would only clutter the chart. */
  const barsByPerson = useMemo(() => {
    const map = new Map<string, OrgTimeOffRequest[]>()
    for (const r of requests) {
      if (r.status !== "APPROVED" && r.status !== "PENDING") continue
      const list = map.get(r.technicianId) ?? []
      list.push(r)
      map.set(r.technicianId, list)
    }
    return map
  }, [requests])

  const coverBySpace = useMemo(
    () => new Map(cover.map((c) => [c.spaceId, c])),
    [cover],
  )

  /*
    Somebody with leave but no workspace still has to appear.

    Cover cannot be judged for them — no workspace, no floor, no roster — but a
    request that silently vanishes from the chart is far worse than one grouped
    under a heading that says so.
  */
  const unassigned = useMemo(() => {
    const known = new Set(spaces.flatMap((s) => s.people.map((p) => p.id)))
    const seen = new Map<string, { id: string; firstName: string; lastName: string; specialty: string | null }>()
    for (const r of requests) {
      if (known.has(r.technicianId)) continue
      if (r.status !== "APPROVED" && r.status !== "PENDING") continue
      if (!seen.has(r.technicianId)) {
        seen.set(r.technicianId, {
          id: r.technician.id,
          firstName: r.technician.firstName,
          lastName: r.technician.lastName,
          specialty: r.technician.specialty,
        })
      }
    }
    return [...seen.values()]
  }, [requests, spaces])

  const selected = selectedId ? requests.find((r) => r.id === selectedId) ?? null : null

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border shadow-sm p-4 space-y-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  /*
    Nobody to draw.

    Said out loud rather than rendered as a bare date header, because "no
    workspace has anybody in it" and "the roster failed to load" look identical
    once the grid is empty — and the reader has no way to tell which they are
    looking at. The page reports a failed read separately, so reaching here
    genuinely means there is nobody.
  */
  if (!spaces.some((s) => s.people.length) && !unassigned.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center shadow-sm">
        <Users className="mx-auto mb-3 h-9 w-9 text-muted-foreground" strokeWidth={1.5} />
        <p className="text-sm font-medium text-foreground">
          {t("cover.chart.emptyTitle", "Nobody to show here")}
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t(
            "cover.chart.emptyBody",
            "No member is assigned to a workspace yet. Assign people to a workspace and their leave will appear here.",
          )}
        </p>
      </div>
    )
  }

  // One grid template shared by every row, so the sticky name column and each
  // day column line up without any per-row measurement.
  const template = { gridTemplateColumns: `13rem repeat(${days.length}, minmax(2.1rem, 1fr))` }
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6

  return (
    <div className={cn("bg-card rounded-xl border border-border shadow-sm overflow-hidden", selected && "is-focused")}>
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Dates */}
          <div className="grid bg-muted/50 border-b border-border" style={template}>
            <div className="sticky left-0 z-20 bg-muted/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-r border-border">
              {t("cover.chart.team", "Team")}
            </div>
            {days.map((d) => (
              <div
                key={d.toISOString()}
                className={cn(
                  "border-l border-border py-1.5 text-center",
                  isWeekend(d) && "bg-muted",
                )}
              >
                <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/70">
                  {format(d, "EEEEE")}
                </span>
                <span
                  className={cn(
                    "block text-[12px] font-semibold tabular-nums text-muted-foreground",
                    isSameDay(d, new Date()) &&
                      "mx-auto grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground",
                  )}
                >
                  {format(d, "d")}
                </span>
              </div>
            ))}
          </div>

          {spaces.map((space) => {
            const c = coverBySpace.get(space.spaceId)
            return (
              <SpaceBlock
                key={space.spaceId}
                title={space.spaceName}
                minCover={space.minCover}
                rotaKnown={c?.rotaKnown ?? space.rotaKnown}
                people={space.people}
                days={days}
                dayKeys={dayKeys}
                todayKey={todayKey}
                template={template}
                barsByPerson={barsByPerson}
                cover={c}
                selected={selected}
                selectedInThisSpace={
                  !!selected && space.people.some((p) => p.id === selected.technicianId)
                }
                onSelect={onSelect}
              />
            )
          })}

          {unassigned.length > 0 && (
            <SpaceBlock
              title={t("cover.chart.unassigned", "Not in any workspace")}
              minCover={0}
              rotaKnown={false}
              people={unassigned.map((p) => ({ ...p, position: null }))}
              days={days}
              dayKeys={dayKeys}
              todayKey={todayKey}
              template={template}
              barsByPerson={barsByPerson}
              cover={undefined}
              selected={selected}
              selectedInThisSpace={false}
              onSelect={onSelect}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function SpaceBlock({
  title,
  minCover,
  rotaKnown,
  people,
  days,
  dayKeys,
  todayKey,
  template,
  barsByPerson,
  cover,
  selected,
  selectedInThisSpace,
  onSelect,
}: {
  title: string
  minCover: number
  rotaKnown: boolean
  people: Array<{ id: string; firstName: string; lastName: string; specialty: string | null; position: string | null }>
  days: Date[]
  dayKeys: string[]
  todayKey: string
  template: React.CSSProperties
  barsByPerson: Map<string, OrgTimeOffRequest[]>
  cover?: CoverRangeSpace
  selected: OrgTimeOffRequest | null
  selectedInThisSpace: boolean
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  if (!people.length) return null

  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6
  const dayCover = new Map((cover?.days ?? []).map((d) => [d.day, d]))

  /** Would the selected request take this day's count down? */
  const projected = (dayKey: string, working: number): number | null => {
    if (!selected || !selectedInThisSpace) return null
    if (dayKey < selected.startDate.slice(0, 10) || dayKey > selected.endDate.slice(0, 10)) return null
    const d = selected.cover?.days?.find((x) => x.day === dayKey)
    return d ? d.then : working
  }

  return (
    <>
      <div className="sticky left-0 flex items-center gap-2 border-y border-border bg-muted/70 px-4 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        {minCover > 0 && (
          <span className="text-[11px] text-muted-foreground/70">
            {t("cover.chart.minimum", "· minimum cover {{n}}", { n: minCover })}
          </span>
        )}
        {!rotaKnown && (
          <span className="text-[10.5px] text-muted-foreground/60">
            {t("cover.noRota.badge", "no rota set")}
          </span>
        )}
      </div>

      {people.map((p) => {
        const bars = barsByPerson.get(p.id) ?? []
        return (
          <div key={p.id} className="grid border-b border-border last:border-b-0" style={template}>
            <div className="sticky left-0 z-10 flex min-h-[2.9rem] items-center gap-2 border-r border-border bg-card px-3 py-1.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-[10.5px] font-semibold text-muted-foreground">
                {p.firstName[0]}
                {p.lastName[0]}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium leading-tight text-foreground">
                  {p.firstName} {p.lastName}
                </span>
                <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                  {p.specialty || p.position || ""}
                </span>
              </span>
            </div>

            {days.map((d) => (
              <div
                key={d.toISOString()}
                className={cn("border-l border-border", isWeekend(d) && "bg-muted/60")}
              />
            ))}

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

              const tip = `${p.firstName} ${p.lastName} — ${format(parseISO(bar.startDate), "d MMM")}${
                from !== to ? ` – ${format(parseISO(bar.endDate), "d MMM")}` : ""
              }${pending ? ` · ${t("cover.chart.pendingTip", "pending — click to decide")}` : ` · ${t("common.approved")}`}${
                bar.cover ? ` · ${coverShort(bar.cover, t)}` : ""
              }`

              const common = "row-start-1 self-center mx-0.5 h-6 rounded-md px-1.5 flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap overflow-hidden"

              return pending ? (
                <button
                  key={bar.id}
                  type="button"
                  title={tip}
                  onClick={() => onSelect(bar.id)}
                  style={{ gridColumn: `${startIdx + 2} / ${endIdx + 3}` }}
                  className={cn(
                    common,
                    "z-[2] cursor-pointer border-[1.5px] border-amber-500/80 text-amber-900 dark:text-amber-200 transition",
                    "bg-[repeating-linear-gradient(45deg,theme(colors.amber.200)_0_4px,theme(colors.amber.300)_4px_8px)]",
                    "dark:bg-[repeating-linear-gradient(45deg,theme(colors.amber.950)_0_4px,theme(colors.amber.900)_4px_8px)]",
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
          </div>
        )
      })}

      {/* On the floor — the count, then the verdict. Two rows because they are
          two different statements, and a manager should read a judgement rather
          than perform the subtraction themselves. */}
      {cover && (
        <>
          <div className="grid border-t border-border bg-muted/50" style={template}>
            <div className="sticky left-0 z-10 flex items-center gap-1.5 border-r border-border bg-muted/50 px-3 py-1.5 text-[11.5px] font-semibold text-muted-foreground">
              {t("cover.chart.onFloor", "On the floor")}
            </div>
            {days.map((d) => {
              const k = format(d, "yyyy-MM-dd")
              const info = dayCover.get(k)
              const proj = info ? projected(k, info.working) : null
              if (!info || info.rostered === 0) {
                return <div key={k} className={cn("border-l border-border py-1.5 text-center text-xs text-muted-foreground/50", isWeekend(d) && "bg-muted")}>—</div>
              }
              const short = minCover > 0 && info.working < minCover
              const tight = minCover > 0 && info.working === minCover
              return (
                <div
                  key={k}
                  className={cn(
                    "border-l border-border py-1 text-center text-xs tabular-nums",
                    isWeekend(d) && "bg-muted",
                    short ? "font-bold text-red-600 dark:text-red-400" : tight ? "font-bold text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                  )}
                >
                  {info.working}
                  {proj !== null && proj !== info.working && (
                    <span
                      className={cn(
                        "block text-[10px] font-bold leading-tight",
                        minCover > 0 && proj < minCover ? "text-red-600 dark:text-red-400" : "text-primary",
                      )}
                    >
                      → {proj}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {minCover > 0 && (
            <div className="grid border-t border-border bg-muted/50" style={template}>
              <div className="sticky left-0 z-10 flex items-center border-r border-border bg-muted/50 px-3 py-1.5 text-[11.5px] font-semibold text-muted-foreground">
                {t("cover.chart.againstMinimum", "Against minimum {{n}}", { n: minCover })}
              </div>
              {days.map((d) => {
                const k = format(d, "yyyy-MM-dd")
                const info = dayCover.get(k)
                if (!info || info.rostered === 0) {
                  return <div key={k} className={cn("border-l border-border py-1 text-center text-xs text-muted-foreground/40", isWeekend(d) && "bg-muted")}>·</div>
                }
                const n = projected(k, info.working) ?? info.working
                const mark = n < minCover ? "▲" : n === minCover ? "!" : "✓"
                return (
                  <div
                    key={k}
                    className={cn(
                      "border-l border-border py-1 text-center text-xs",
                      isWeekend(d) && "bg-muted",
                      n < minCover
                        ? "font-bold text-red-600 dark:text-red-400"
                        : n === minCover
                          ? "font-bold text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {mark}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </>
  )
}

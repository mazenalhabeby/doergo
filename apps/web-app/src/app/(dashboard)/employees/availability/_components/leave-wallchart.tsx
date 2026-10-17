"use client"

import { useMemo } from "react"
import Link from "next/link"
import { format, isSameDay } from "date-fns"
import { Users } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { FloorSpace, OrgTimeOffRequest } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { isAbsence } from "@/lib/requests"
import { SpaceBlock } from "./leave-wallchart-space"
import { type CoverRangeSpace, restingFn } from "./leave-wallchart-days"

/**
 * The wallchart: people down the side, days across, leave drawn as bars.
 *
 * It replaces two tabs. Deciding leave used to mean reading a table of requests,
 * then switching to a calendar to work out who would be left — and the calendar
 * could not answer, because it drew only APPROVED leave and so never showed the
 * effect of the decision being made.
 *
 * ONLY LEAVE IS A BAR. A remote day, a changed day or agreed overtime is a day
 * WORKED, so it is drawn as a thin outlined marker along the foot of the row —
 * visible and decidable from here, never mistaken for somebody being off.
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
  restDays,
  holidays,
}: {
  /** The workspace's rest days (its weekend) and holidays, from the calendar — never a hard-coded Sat+Sun. */
  restDays?: Set<string>
  holidays?: Map<string, string>
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
  const { barsByPerson, marksByPerson } = useMemo(() => {
    const bars = new Map<string, OrgTimeOffRequest[]>()
    const marks = new Map<string, OrgTimeOffRequest[]>()
    for (const r of requests) {
      if (r.status !== "APPROVED" && r.status !== "PENDING") continue
      const map = isAbsence(r.kind) ? bars : marks
      const list = map.get(r.technicianId) ?? []
      list.push(r)
      map.set(r.technicianId, list)
    }
    return { barsByPerson: bars, marksByPerson: marks }
  }, [requests])

  const coverBySpace = useMemo(() => new Map(cover.map((c) => [c.spaceId, c])), [cover])

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

  const selected = selectedId ? (requests.find((r) => r.id === selectedId) ?? null) : null

  if (isLoading) {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
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
      <div className="rounded-2xl border border-border bg-card p-12 text-center">
        <Users className="mx-auto mb-3 h-9 w-9 text-muted-foreground" strokeWidth={1.5} />
        <p className="text-sm font-medium text-foreground">{t("cover.chart.emptyTitle", "Nobody to show here")}</p>
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
  const isWeekend = restingFn(restDays, holidays)

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-card", selected && "is-focused")}>
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Dates */}
          <div className="grid bg-muted/50 border-b border-border" style={template}>
            <div className="sticky left-0 z-20 bg-muted/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-r border-border">
              {t("cover.chart.team", "Team")}
            </div>
            {days.map((d) => (
              // The day opens in the calendar — everything on it, not only the leave.
              <Link
                key={d.toISOString()}
                href={`/calendar?date=${format(d, "yyyy-MM-dd")}&view=day`}
                title={t("cover.chart.openDay", "Open this day in the calendar")}
                className={cn(
                  "border-l border-border py-1.5 text-center transition-colors hover:bg-primary/10",
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
              </Link>
            ))}
          </div>

          {spaces.map((space) => {
            const c = coverBySpace.get(space.spaceId)
            return (
              <SpaceBlock
                restDays={restDays}
                holidays={holidays}
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
                marksByPerson={marksByPerson}
                cover={c}
                selected={selected}
                selectedInThisSpace={!!selected && space.people.some((p) => p.id === selected.technicianId)}
                onSelect={onSelect}
              />
            )
          })}

          {unassigned.length > 0 && (
            <SpaceBlock
              restDays={restDays}
              holidays={holidays}
              title={t("cover.chart.unassigned", "Not in any workspace")}
              minCover={0}
              rotaKnown={false}
              people={unassigned.map((p) => ({ ...p, position: null }))}
              days={days}
              dayKeys={dayKeys}
              todayKey={todayKey}
              template={template}
              barsByPerson={barsByPerson}
              marksByPerson={marksByPerson}
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

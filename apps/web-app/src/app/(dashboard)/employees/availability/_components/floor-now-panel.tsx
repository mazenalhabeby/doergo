"use client"

import { personName } from "@hbcfield/shared/client"
import { useRouteAccess } from "@/hooks/use-route-access"
import { useCallback, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Columns3, ListFilter, Radio } from "lucide-react"

import { employeesApi, type FloorPerson, type FloorSpace } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useTimeFormat } from "@/hooks/use-time-format"
import { LATE_TEXT, byUsefulness, lateness, readStoredFloorView, storeFloorView, tally, type FloorView } from "../_lib/floor-view"
import { keys } from "@/lib/query-keys"
import { useExceptionsCard, useLine, type Fmt } from "./use-exceptions-card"
import { Bar, Avatar, CardHead } from "./exceptions-card-helpers"
import { ExceptionsCardFloorNow } from "./exceptions-card-floor-now"

/**
 * Who is on the floor right now.
 *
 * The half the old calendar could not answer, because it PLANNED — it drew the
 * rota and approved leave and called the result "available", which says nothing
 * about whether anybody turned up. This REPORTS.
 *
 * Two numbers, deliberately: DUE comes from the rota, HERE comes from the clock,
 * and the gap between them is the only actionable thing on the panel. A
 * workspace can satisfy its rota perfectly and still be short because somebody
 * called in sick this morning.
 *
 * Two layouts, because two people want different things from the same data —
 * see `_lib/floor-view.ts`. The choice is the reader's and is remembered.
 */
export function FloorNowPanel({ spaceFilter }: { spaceFilter: string }) {
  const { t } = useTranslation()
  const { formatTime } = useTimeFormat()
  // Initialised from storage the same way the tasks page does it — the reader is
  // its own single source, and it falls back to the default when there is no
  // browser or storage is unreadable.
  const [view, setView] = useState<FloorView>(readStoredFloorView)

  const choose = useCallback((v: FloorView) => {
    setView(v)
    storeFloorView(v)
  }, [])

  const readsFloor = useRouteAccess().holds("any:canViewSpaceAttendance")
  const { data: spaces = [], isLoading } = useQuery({
    queryKey: keys.attendance.floorNow(),
    queryFn: () => employeesApi.getFloorNow(),
    staleTime: 30_000,
    // @RequirePermissionInSpace('canViewSpaceAttendance') — asked only of whoever holds it.
    enabled: readsFloor,
    // A safety refetch, not the delivery mechanism: clock events already
    // invalidate this key over the socket. This is what heals a missed one.
    refetchInterval: 60_000,
  })

  const shown = useMemo(
    () => (spaceFilter === "all" ? spaces : spaces.filter((s) => s.spaceId === spaceFilter))
      .filter((s) => s.people.length),
    [spaces, spaceFilter],
  )

  if (isLoading) {
    return (
      <div className="mb-4 rounded-2xl border border-border bg-card p-4">
        <Skeleton className="mb-4 h-4 w-40" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  if (!shown.length) return null

  return (
    <section className="mb-4">
      <header className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-500" aria-hidden />
          {t("cover.floorNow.title", "On the floor right now")}
        </h2>

        <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="group"
             aria-label={t("cover.floorNow.viewLabel", "Layout")}>
          {([
            ["exceptions", ListFilter, t("cover.floorNow.viewExceptions", "Only what needs you")],
            ["lanes", Columns3, t("cover.floorNow.viewLanes", "Everyone, grouped")],
          ] as const).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => choose(v)}
              title={label}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition",
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {shown.map((space) =>
          view === "lanes" ? (
            <LanesCard key={space.spaceId} space={space} formatTime={formatTime} />
          ) : (
            <ExceptionsCard key={space.spaceId} space={space} formatTime={formatTime} />
          ),
        )}
      </div>
    </section>
  )
}

/* ==========================================================================
   Lanes — everyone, grouped by what they are doing
   ========================================================================== */

function LanesCard({ space, formatTime }: { space: FloorSpace; formatTime: Fmt }) {
  const { t } = useTranslation()
  const c = tally(space)
  const line = useLine(formatTime, space.timezone)
  const of = (...states: FloorPerson["state"][]) =>
    space.people.filter((p) => states.includes(p.state)).sort(byUsefulness)

  const lanes: Array<{ key: string; label: string; tone: string; people: FloorPerson[]; alarm?: boolean }> = [
    {
      key: "expected",
      label: t("cover.lane.notIn", "Not in"),
      tone: "text-red-600 dark:text-red-400",
      people: of("expected"),
      alarm: true
    },
    { key: "working", label: t("cover.lane.free", "Free now"), tone: "text-emerald-600 dark:text-emerald-400", people: of("working") },
    { key: "busy", label: t("cover.lane.onJob", "On a job"), tone: "text-blue-600 dark:text-blue-400", people: of("busy") },
    { key: "break", label: t("cover.lane.break", "On a break"), tone: "text-amber-600 dark:text-amber-400", people: of("break") },
    { key: "away", label: t("cover.lane.away", "Away"), tone: "text-muted-foreground", people: of("leave", "rest") },
  ]

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <CardHead space={space} c={c} />
      <div className="px-4 pb-3 pt-3">
        <Bar space={space} t={c} />
      </div>
      <div className="grid border-t border-border sm:grid-cols-2 lg:grid-cols-5">
        {lanes.map((lane) => (
          <div
            key={lane.key}
            className={cn(
              "min-w-0 border-b border-r border-border p-3 last:border-r-0",
              lane.alarm && lane.people.length > 0 && "bg-red-500/5",
            )}
          >
            <div className={cn("mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider", lane.tone)}>
              {lane.label}
              <span className="ml-auto tabular-nums">{lane.people.length}</span>
            </div>
            {lane.people.length ? (
              <div className="flex flex-col gap-2">
                {lane.people.map((p) => {
                  const l = line(p)
                  return (
                    <div key={p.id} className="flex min-w-0 items-center gap-2">
                      <Avatar person={p} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium leading-tight">
                          {personName(p)}
                        </span>
                        <span className={cn("block truncate text-[11px] leading-tight text-muted-foreground", l.tone)}>
                          {l.text}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <span className="text-[12px] italic text-muted-foreground/70">—</span>
            )}
          </div>
        ))}
      </div>
    </article>
  )
}

/* ==========================================================================
   Exceptions first — a verdict, then only what is wrong
   ========================================================================== */

function ExceptionsCard({ space, formatTime }: { space: FloorSpace; formatTime: Fmt }) {
  const vm = useExceptionsCard({ space, formatTime })
  const {
    t,
    c,
    line,
    overdue,
    here,
    soon,
    away,
    good,
  } = vm

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <CardHead space={space} c={c} />

      <div className="px-4 pb-3.5 pt-3">
        <div
          className={cn(
            "mb-3 flex items-center gap-2.5 text-[14px] font-semibold tracking-tight",
            good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
          )}
        >
          <span
            className={cn(
              "grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[13px] font-extrabold",
              good ? "bg-emerald-500/10" : "bg-red-500/10",
            )}
            aria-hidden
          >
            {good ? "✓" : "▲"}
          </span>
          {good
            ? t("cover.floorNow.allHere", "Everyone expected is here")
            : space.status === "short"
              ? t("cover.floor.short", "{{n}} under minimum", { n: space.minCover - c.here })
              : t("cover.floorNow.notIn", "{{count}} has not clocked in", { count: overdue.length })}
        </div>
        <Bar space={space} t={c} />
      </div>

      {overdue.length > 0 && (
        <div className="flex flex-col gap-2 px-4 pb-3">
          {overdue.map((p) => {
            const l = lateness(p)!
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5"
              >
                <Avatar person={p} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold tracking-tight">
                    {personName(p)}
                  </span>
                  <span className={cn("text-[12px] font-medium", LATE_TEXT[l.tone])}>
                    {p.trade ? `${p.trade} · ` : ""}
                    {line(p).text}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      <ExceptionsCardFloorNow vm={vm} />
    </article>
  )
}

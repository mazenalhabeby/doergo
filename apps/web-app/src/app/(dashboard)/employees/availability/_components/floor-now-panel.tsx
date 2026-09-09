"use client"

import { useCallback, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Columns3, ListFilter, Radio } from "lucide-react"

import { employeesApi, type FloorPerson, type FloorSpace } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useTimeFormat } from "@/hooks/use-time-format"
import { FLOOR_TONE, floorLabel } from "../_lib/cover-labels"
import {
  LATE_RING,
  LATE_TEXT,
  STATE_RING,
  byUsefulness,
  isExpected,
  isPresent,
  lateLabel,
  lateness,
  readStoredFloorView,
  storeFloorView,
  tally,
  type FloorTally,
  type FloorView,
} from "../_lib/floor-view"

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

  const { data: spaces = [], isLoading } = useQuery({
    queryKey: ["floor-now"],
    queryFn: () => employeesApi.getFloorNow(),
    staleTime: 30_000,
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
      <div className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm">
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

type Fmt = (d: string | Date, tz?: string | null) => string

/* ==========================================================================
   Shared pieces
   ========================================================================== */

/**
 * The proportion bar.
 *
 * Reads in a glance; the fraction beside it is the footnote, not the headline.
 * ⚠️ Only people who were DUE are in the track — somebody on approved leave was
 * never going to be here, and padding the bar with them would make a thin floor
 * look comfortable.
 */
function Bar({ space, t: c }: { space: FloorSpace; t: FloorTally }) {
  const total = c.due || 1
  const pct = (n: number) => `${(n / total) * 100}%`
  const floorPct = space.minCover ? Math.min(100, (space.minCover / total) * 100) : null

  return (
    <div className="relative h-2 w-full overflow-visible rounded-full bg-muted">
      <div className="flex h-full w-full overflow-hidden rounded-full">
        {c.busy > 0 && <span className="h-full bg-blue-500" style={{ width: pct(c.busy) }} />}
        {c.working > 0 && <span className="h-full bg-emerald-500" style={{ width: pct(c.working) }} />}
        {c.break > 0 && <span className="h-full bg-amber-500" style={{ width: pct(c.break) }} />}
        {c.expected > 0 && <span className="h-full bg-red-500/70" style={{ width: pct(c.expected) }} />}
      </div>
      {/* The floor, drawn ON the bar: "are we above the line" needs no arithmetic. */}
      {floorPct !== null && (
        <span
          className="absolute -top-1 -bottom-1 w-0.5 rounded-sm bg-foreground/60"
          style={{ left: `${floorPct}%` }}
          aria-hidden
        />
      )}
    </div>
  )
}

function Fraction({ t: c }: { t: FloorTally }) {
  return (
    <span className="flex items-baseline gap-0.5 tabular-nums">
      <span className="text-[23px] font-bold leading-none tracking-tight">{c.here}</span>
      <span className="text-[13px] font-semibold text-muted-foreground">/{c.due}</span>
    </span>
  )
}

function Avatar({ person, size = "sm" }: { person: FloorPerson; size?: "sm" | "md" }) {
  const late = lateness(person)
  const ring = late ? LATE_RING[late.tone] : STATE_RING[person.state]
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-offset-2 ring-offset-card",
        size === "md" ? "h-9 w-9 text-[12.5px]" : "h-7 w-7 text-[10.5px]",
        ring,
        person.state === "rest" && "opacity-50",
        (person.state === "leave" || person.state === "expected") && "ring-dashed",
      )}
    >
      {person.firstName[0]}
      {person.lastName[0]}
    </span>
  )
}

/** What this person is doing, in the words the reader would use. */
function useLine(formatTime: Fmt, tz?: string) {
  const { t } = useTranslation()
  return useCallback(
    (p: FloorPerson): { text: string; tone?: string } => {
      const late = lateness(p)
      switch (p.state) {
        case "busy":
          // The job title is the useful line. "Clocked in" tells a dispatcher
          // nothing; the job name tells them whether it is interruptible.
          return { text: p.task?.title ?? t("cover.chip.free", "Clocked in, free"), tone: "text-blue-600 dark:text-blue-400" }
        case "working":
          return { text: t("cover.chip.freeSince", "Free · in since {{time}}", { time: p.since ? formatTime(p.since, tz) : "—" }) }
        case "break":
          return { text: t("cover.chip.breakSince", "Break · since {{time}}", { time: p.breakSince ? formatTime(p.breakSince, tz) : "—" }) }
        case "expected":
          if (!late) return { text: t("cover.chip.notIn", "Not clocked in") }
          return late.minutes < 0
            ? { text: t("cover.chip.dueIn", "Due {{time}} · in {{ago}}", { time: p.dueAt ? formatTime(p.dueAt, tz) : "—", ago: lateLabel(late.minutes) }), tone: LATE_TEXT[late.tone] }
            : { text: t("cover.chip.lateBy", "Due {{time}} · {{ago}} ago", { time: p.dueAt ? formatTime(p.dueAt, tz) : "—", ago: lateLabel(late.minutes) }), tone: LATE_TEXT[late.tone] }
        case "leave":
          return { text: t("cover.chip.leave", "On leave until {{date}}", { date: p.leaveUntil ?? "—" }) }
        default:
          return { text: t("cover.chip.rest", "Not rostered today") }
      }
    },
    [formatTime, t, tz],
  )
}

function CardHead({ space, c }: { space: FloorSpace; c: FloorTally }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3.5">
      <span className="flex min-w-0 items-baseline gap-2.5">
        <b className="truncate text-[14.5px] font-semibold tracking-tight">{space.spaceName}</b>
        {!space.rotaKnown && (
          <span
            className="shrink-0 text-[11px] text-muted-foreground/70"
            title={t("cover.noRota.hint", "Nobody here has a working week set, so this counts heads rather than a rota.")}
          >
            {t("cover.noRota.badge", "no rota set")}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2.5">
        <Fraction t={c} />
        <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-semibold", FLOOR_TONE[space.status])}>
          {floorLabel(space, t)}
        </span>
      </span>
    </div>
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
    { key: "expected", label: t("cover.lane.notIn", "Not in"), tone: "text-red-600 dark:text-red-400", people: of("expected"), alarm: true },
    { key: "working", label: t("cover.lane.free", "Free now"), tone: "text-emerald-600 dark:text-emerald-400", people: of("working") },
    { key: "busy", label: t("cover.lane.onJob", "On a job"), tone: "text-blue-600 dark:text-blue-400", people: of("busy") },
    { key: "break", label: t("cover.lane.break", "On a break"), tone: "text-amber-600 dark:text-amber-400", people: of("break") },
    { key: "away", label: t("cover.lane.away", "Away"), tone: "text-muted-foreground", people: of("leave", "rest") },
  ]

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
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
                          {p.firstName} {p.lastName}
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
  const { t } = useTranslation()
  const c = tally(space)
  const line = useLine(formatTime, space.timezone)

  // Only somebody actually overdue is an exception. Due in ten minutes is not
  // an incident, and treating it as one teaches people to ignore the panel.
  const overdue = space.people
    .filter((p) => {
      const l = lateness(p)
      return l && l.minutes >= 5
    })
    .sort(byUsefulness)

  const here = space.people.filter(isPresent).sort(byUsefulness)
  const soon = space.people.filter((p) => p.state === "expected" && !overdue.includes(p))
  const away = space.people.filter((p) => !isExpected(p))
  const good = overdue.length === 0 && space.status !== "short"

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
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
                    {p.firstName} {p.lastName}
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

      <div className="border-t border-border px-4 py-3">
        <h4 className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {t("cover.floorNow.working", "Working")}
          <span className="tabular-nums text-muted-foreground/80">{here.length}</span>
        </h4>
        {here.length ? (
          <div className="flex flex-wrap gap-2">
            {here.map((p) => {
              const l = line(p)
              return (
                <span
                  key={p.id}
                  className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-muted/40 py-1 pl-1.5 pr-3"
                  title={`${p.firstName} ${p.lastName}${p.trade ? ` · ${p.trade}` : ""} — ${l.text}`}
                >
                  <Avatar person={p} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-medium leading-tight">
                      {p.firstName} {p.lastName}
                    </span>
                    <span className={cn("block max-w-[16ch] truncate text-[10.5px] leading-tight text-muted-foreground", l.tone)}>
                      {l.text}
                    </span>
                  </span>
                </span>
              )
            })}
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">{t("cover.floorNow.nobodyIn", "Nobody has clocked in yet.")}</p>
        )}

        {(soon.length > 0 || away.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            {soon.length > 0 && (
              <span>{t("cover.floorNow.dueSoon", "{{count}} due shortly", { count: soon.length })}</span>
            )}
            {away.length > 0 && (
              <>
                <span>{t("cover.floorNow.notExpected", "Not expected today:")}</span>
                {away.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 py-0.5 pl-0.5 pr-2.5 text-[11.5px] font-medium text-violet-700 dark:text-violet-300"
                  >
                    <Avatar person={p} />
                    {p.firstName}
                    {p.leaveUntil ? ` · ${t("cover.floorNow.back", "back {{date}}", { date: p.leaveUntil })}` : ""}
                  </span>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

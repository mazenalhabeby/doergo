"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns"
import { AlertCircle, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { employeesApi, type OrgTimeOffRequest } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SpaceTabs } from "@/components/space-tabs"
import { useSpaceScope } from "@/hooks/use-space-scope"
import { cn } from "@/lib/utils"

import { FloorNowPanel } from "./_components/floor-now-panel"
import { LeaveWallchart } from "./_components/leave-wallchart"
import { LeaveDecisionDrawer } from "./_components/leave-decision-drawer"
import { COVER_TONE } from "./_lib/cover-labels"

/**
 * Schedule & Time Off — one page, two questions.
 *
 *   who is working RIGHT NOW      → the live floor panel
 *   who wants to be off LATER     → the wallchart, decided in place
 *
 * It replaced two tabs. Reading a table of requests and then switching to a
 * calendar to work out who would be left was slow, and worse than slow: the
 * calendar drew only APPROVED leave, so it could not show the effect of the
 * decision being made on the other tab. The answer now travels with the request.
 */

type Range = "fortnight" | "month"

export default function ScheduleAndTimeOffPage() {
  const { user, hasPermission } = useAuth()
  const { t } = useTranslation()
  const searchParams = useSearchParams()

  const [anchor, setAnchor] = useState(() => new Date())
  const [range, setRange] = useState<Range>("month")
  /*
    One workspace at a time, and never "all".

    A floor has a roster, a minimum and a verdict, and none of those mean
    anything averaged across sites — "All" rendered five stacked cards and a
    five-block chart, which is the density this page exists to remove.

    `useSpaceScope` is the app's answer to "which workspace am I looking at",
    so this asks it the same way every other screen does: `allowAll: false`
    opens on the first one, the choice lives in `?space=` so a filtered view is
    a link, and a stale id in the URL falls back instead of erroring. No module
    filter — see the hook.
  */
  const { spaces: spaceOptions, spaceId, setSpaceId, ready: spacesReady, showTabs } =
    useSpaceScope({ allowAll: false })
  const space = spaceId ?? ""
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const canManage = user?.role === "ADMIN" || hasPermission("canViewAllTasks")
  const canDecide = user?.role === "ADMIN" || hasPermission("canManageRota")

  /*
    A month by default.

    Leave is planned a month out, so the month is the window somebody opens this
    page holding in their head — a fortnight kept hiding the second half of a
    request that had only just been made.

    ⚠️ Thirty columns do not fit a laptop, so the chart scrolls sideways. That is
    survivable only because the footer's name column is sticky: the "on the
    floor" and "against minimum" labels stay put while the days move under them.
    Break that stickiness and this default becomes unreadable. Two weeks stays
    one click away for anyone who wants everything on screen at once.
  */
  const days = useMemo(() => {
    if (range === "month") {
      return eachDayOfInterval({ start: startOfMonth(anchor), end: endOfMonth(anchor) })
    }
    const start = startOfWeek(anchor, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end: addDays(start, 13) })
  }, [anchor, range])

  const window = useMemo(
    () => ({
      start: format(days[0]!, "yyyy-MM-dd"),
      end: format(days[days.length - 1]!, "yyyy-MM-dd"),
    }),
    [days],
  )

  // Every leave record still on the books. The wallchart draws them; pending
  // rows carry their cover verdict, computed server-side.
  const leaveQuery = useQuery({
    queryKey: ["orgTimeOff", "all"],
    queryFn: () => employeesApi.getOrgTimeOff(),
    staleTime: 30_000,
    enabled: canManage,
  })

  // The roster, grouped by workspace — and today's live state, which the panel
  // above the chart renders. One read serves both, so the chart's rows and the
  // panel's chips can never show a different set of people.
  const floorQuery = useQuery({
    queryKey: ["floor-now"],
    queryFn: () => employeesApi.getFloorNow(),
    staleTime: 30_000,
    enabled: canManage,
  })

  const coverQuery = useQuery({
    queryKey: ["cover-range", window.start, window.end],
    queryFn: () => employeesApi.getCoverRange(window.start, window.end),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled: canManage,
  })

  const requests = leaveQuery.data ?? []
  const allSpaces = useMemo(() => floorQuery.data ?? [], [floorQuery.data])

  /*
    Which one OPENS.

    The hook's default is the first workspace, which is what was asked for — but
    on a real organization most workspaces are customer sites with nobody
    assigned, and landing on one of those is the blank page this feature already
    cost a round trip to explain once. So when the address names no workspace,
    move to the first that actually has a roster. Runs once, only while the URL
    is unset, so it never argues with a choice somebody made.
  */
  const nudged = useRef(false)
  useEffect(() => {
    if (nudged.current || !spacesReady || !allSpaces.length) return
    if (searchParams.get("space")) { nudged.current = true; return }
    const withPeople = spaceOptions.find((o) => allSpaces.some((s) => s.spaceId === o.id && s.people.length))
    nudged.current = true
    if (withPeople && withPeople.id !== spaceId) setSpaceId(withPeople.id)
  }, [spacesReady, allSpaces, spaceOptions, spaceId, setSpaceId, searchParams])

  const spaces = useMemo(
    () => allSpaces.filter((s) => s.spaceId === space),
    [allSpaces, space],
  )

  const pending = useMemo(() => requests.filter((r) => r.status === "PENDING"), [requests])

  /** The two facts that decide whether this page needs opening at all. */
  const summary = useMemo(() => {
    // Only this workspace's people — the counts head a page about one floor.
    const inScope = (r: OrgTimeOffRequest) =>
      spaces.some((s) => s.people.some((p) => p.id === r.technicianId))
    const mine = pending.filter(inScope)
    return {
      waiting: mine.length,
      risky: mine.filter((r) => r.cover && (r.cover.level === "short" || r.cover.level === "skill")).length,
      skill: mine.filter((r) => r.cover?.level === "skill").length,
      soonest: mine.map((r) => r.startDate).sort()[0] ?? null,
    }
  }, [pending, spaces, space])

  const selected = selectedId ? requests.find((r) => r.id === selectedId) ?? null : null

  // Whichever read failed first. Any of the three leaves the page unable to say
  // anything true, so all three are worth reporting rather than drawing blank.
  const loadError = (floorQuery.error ?? leaveQuery.error ?? coverQuery.error) as Error | null

  const step = useCallback(
    (dir: 1 | -1) =>
      setAnchor((a) => (range === "month" ? (dir === 1 ? addMonths(a, 1) : subMonths(a, 1)) : addDays(a, dir * 14))),
    [range],
  )

  if (!canManage) {
    return (
      <div className="min-h-full bg-background">
        <div className="mx-auto max-w-screen-xl px-6 py-8">
          <div className="rounded-xl border border-border/80 bg-card p-12 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
            <h3 className="mb-2 text-lg font-medium text-foreground">
              {t("technicians.availabilityPage.accessDenied")}
            </h3>
            <p className="text-sm text-muted-foreground">{t("technicians.availabilityPage.noPermission")}</p>
          </div>
        </div>
      </div>
    )
  }

  const rangeLabel =
    range === "month"
      ? format(anchor, "MMMM yyyy")
      : `${format(days[0]!, "d MMM")} – ${format(days[days.length - 1]!, "d MMM yyyy")}`

  return (
    <TooltipProvider>
      <div className="min-h-full bg-background">
        <div className="mx-auto max-w-screen-xl px-6 py-8">
          <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 data-tour="page-availability" className="text-2xl font-semibold tracking-tight text-foreground">
                {t("technicians.availabilityPage.title")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("cover.page.subtitle", "Who is on the floor now, and who is asking to be off later.")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="group">
                {(["fortnight", "month"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={range === r}
                    onClick={() => setRange(r)}
                    className={cn(
                      "h-8 rounded-md px-3 text-[13px] font-medium transition",
                      range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {r === "fortnight" ? t("cover.range.fortnight", "2 weeks") : t("cover.range.month", "Month")}
                  </button>
                ))}
              </div>

              <Button variant="outline" size="sm" className="h-9 rounded-lg bg-card" onClick={() => setAnchor(new Date())}>
                {t("common.today")}
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg bg-card" onClick={() => step(-1)} aria-label={t("common.previous", "Previous")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[10.5rem] text-center text-sm font-semibold text-foreground">{rangeLabel}</span>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg bg-card" onClick={() => step(1)} aria-label={t("common.next", "Next")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {/*
            A failed read must never look like an empty organization.

            Both of these render "nothing" on error — no roster, no bars — which
            is exactly what a company with nobody in it looks like. That is how a
            missing database column presented itself as "the page is empty", and
            it cost a round trip to diagnose something the screen already knew.
          */}
          {loadError && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                  {t("cover.error.title", "This page could not load")}
                </p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  {loadError.message || t("cover.error.generic", "The server did not answer.")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 bg-card"
                onClick={() => {
                  void floorQuery.refetch()
                  void leaveQuery.refetch()
                  void coverQuery.refetch()
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("common.retry", "Retry")}
              </Button>
            </div>
          )}

          {/*
            The app's own way of asking "which workspace" — the same row the
            tasks, clients and assets screens use, so nobody has to learn a
            second control. No "All" tab: see the scope hook above.
          */}
          {showTabs && (
            <SpaceTabs
              spaces={spaceOptions.map((s) => ({ id: s.id, name: s.name }))}
              value={spaceId}
              onChange={setSpaceId}
              showAll={false}
              className="mb-4"
            />
          )}

          <FloorNowPanel spaceFilter={space} />

          <div data-tour="avail-summary" className="mb-4 grid gap-3 sm:grid-cols-3">
            <Stat
              n={summary.waiting}
              tone={summary.waiting ? "tight" : "ok"}
              title={t("cover.summary.waiting", "Waiting on you")}
              sub={
                summary.soonest
                  ? t("cover.summary.earliest", "Earliest starts {{date}}", {
                      date: format(new Date(summary.soonest), "d MMM"),
                    })
                  : t("cover.summary.nothing", "Nothing to decide")
              }
            />
            <Stat
              n={summary.risky}
              tone={summary.risky ? "short" : "ok"}
              title={t("cover.summary.risky", "Would break cover")}
              sub={
                summary.risky
                  ? t("cover.summary.riskySub", "Approving these drops a day below the floor")
                  : t("cover.summary.riskyNone", "None of them thin the floor")
              }
            />
            <Stat
              n={summary.skill}
              tone={summary.skill ? "skill" : "ok"}
              title={t("cover.summary.skill", "Leave a trade uncovered")}
              sub={
                summary.skill
                  ? t("cover.summary.skillSub", "The only person with that trade is asking")
                  : t("cover.summary.skillNone", "Every trade stays represented")
              }
            />
          </div>

          <div data-tour="avail-calendar">
            <LeaveWallchart
              days={days}
              spaces={spaces}
              requests={requests}
              cover={coverQuery.data ?? []}
              selectedId={selectedId}
              onSelect={setSelectedId}
              // `!space` counts as loading: until a workspace is resolved the
              // chart has nothing to draw, and its empty state would otherwise
              // flash "nobody to show" at somebody whose data is on its way.
              isLoading={floorQuery.isLoading || leaveQuery.isLoading || !space}
            />
          </div>

          <div data-tour="avail-legend" className="flex flex-wrap items-center justify-center gap-6 py-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <i className="h-3 w-5 rounded-sm bg-primary/85" />
              {t("common.approved")}
            </span>
            <span className="inline-flex items-center gap-2">
              <i className="h-3 w-5 rounded-sm border border-amber-500/80 bg-[repeating-linear-gradient(45deg,theme(colors.amber.200)_0_4px,theme(colors.amber.300)_4px_8px)] dark:bg-[repeating-linear-gradient(45deg,theme(colors.amber.950)_0_4px,theme(colors.amber.900)_4px_8px)]" />
              {t("cover.legend.pending", "Pending — yours to decide")}
            </span>
            <span>{t("cover.legend.counts", "Cover counts only people rostered that day")}</span>
          </div>
        </div>
      </div>

      <LeaveDecisionDrawer request={selected} canManage={canDecide} onClose={() => setSelectedId(null)} />
    </TooltipProvider>
  )
}

function Stat({
  n,
  tone,
  title,
  sub,
}: {
  n: number
  tone: keyof typeof COVER_TONE
  title: string
  sub: string
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card p-4 shadow-sm">
      <span className={cn("text-[26px] font-bold leading-none tabular-nums", n ? COVER_TONE[tone].text : "text-foreground")}>
        {n}
      </span>
      <span className="text-[12.5px] leading-snug text-muted-foreground">
        <b className="block text-[13px] font-semibold text-foreground">{title}</b>
        {sub}
      </span>
    </div>
  )
}

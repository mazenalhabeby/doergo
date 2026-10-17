"use client"

import { useRouteAccess } from "@/hooks/use-route-access"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
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
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, House, RefreshCw } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { calendarApi, employeesApi, type OrgTimeOffRequest } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SpaceTabs } from "@/components/space-tabs"
import { useSpaceScope } from "@/hooks/use-space-scope"
import { useLatched } from "@/hooks/use-latched"
import { PAGE_WIDTH } from "@/components/ui/page-width"
import { cn } from "@/lib/utils"

import { FloorNowPanel } from "./_components/floor-now-panel"
import { LeaveWallchart } from "./_components/leave-wallchart"
import { COVER_TONE } from "./_lib/cover-labels"
import { keys } from "@/lib/query-keys"
import { useScheduleAndTimeOffPage } from "./use-schedule-and-time-off-page"
import { LeaveDecisionDrawer, Stat } from "./schedule-and-time-off-page-helpers"

export default function ScheduleAndTimeOffPage() {
  const {
    t,
    anchor,
    setAnchor,
    range,
    setRange,
    spaceOptions,
    spaceId,
    setSpaceId,
    showTabs,
    space,
    selectedId,
    setSelectedId,
    canManage,
    canDecide,
    days,
    restDays,
    holidayNames,
    opensOpening,
    leaveQuery,
    floorQuery,
    coverQuery,
    requests,
    spaces,
    summary,
    selected,
    drawerMounted,
    loadError,
    step,
  } = useScheduleAndTimeOffPage()

  if (!canManage) {
    return (
      <div className="min-h-full bg-background">
        <div className={cn(PAGE_WIDTH, "py-6")}>
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
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
        <div className={cn(PAGE_WIDTH, "py-6")}>
          <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 data-tour="page-availability" className="text-2xl font-semibold tracking-tight text-foreground">
                {t("technicians.availabilityPage.title")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("cover.page.subtitle", "Who is on the floor now, and who is asking to be off later.")}
                {/* A quiet way in to the starting balances — inline, so the header keeps its shape. */}
                {opensOpening && (
                  <>
                    {" · "}
                    <Link href="/employees/leave-opening" className="underline-offset-2 hover:text-foreground hover:underline">
                      {t("leaveLedger.opening.link")}
                    </Link>
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border bg-muted/40 p-0.5" role="group">
                {(["fortnight", "month"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={range === r}
                    onClick={() => setRange(r)}
                    className={cn(
                      "h-7 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition hover:text-foreground",
                      range === r && "bg-background text-foreground shadow-sm ring-1 ring-border",
                    )}
                  >
                    {r === "fortnight" ? t("cover.range.fortnight", "2 weeks") : t("cover.range.month", "Month")}
                  </button>
                ))}
              </div>

              {/* The calendar's counterpart to its Team button — always here, opening on the period on screen. */}
              <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
                <Link href={`/calendar?date=${format(anchor, "yyyy-MM-dd")}`}>
                  <CalendarDays className="h-4 w-4" />
                  {t("nav.sidebar.calendar")}
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => setAnchor(new Date())}>
                {t("common.today")}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => step(-1)}
                aria-label={t("common.previous", "Previous")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[10.5rem] text-center text-sm font-semibold text-foreground">{rangeLabel}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => step(1)} aria-label={t("common.next", "Next")}>
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
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-destructive">
                  {t("cover.error.title", "This page could not load")}
                </p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  {loadError.message || t("cover.error.generic", "The server did not answer.")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
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
              restDays={restDays}
              holidays={holidayNames}
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
              <i
                className={"h-3 w-5 rounded-sm border border-amber-500/80 " +
                  "bg-[repeating-linear-gradient(45deg,theme(colors.amber.200)_0_4px,theme(colors.amber.300)_4px_8px)] " +
                  "dark:bg-[repeating-linear-gradient(45deg,theme(colors.amber.950)_0_4px,theme(colors.amber.900)_4px_8px)]"}
              />
              {t("cover.legend.pending", "Pending — yours to decide")}
            </span>
            <span className="inline-flex items-center gap-2">
              <i
                className={"inline-flex h-4 items-center rounded-full border border-dashed " +
                  "border-amber-500/80 bg-card px-1 text-amber-800 dark:text-amber-300"}>
                <House className="h-2.5 w-2.5" />
              </i>
              {t("requests.legendNotLeave")}
            </span>
            <span>{t("cover.legend.counts", "Cover counts only people rostered that day")}</span>
          </div>
        </div>
      </div>

      {drawerMounted && <LeaveDecisionDrawer request={selected} canManage={canDecide} onClose={() => setSelectedId(null)} />}
    </TooltipProvider>
  )
}

"use client"

import { useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { format } from "date-fns"
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, House, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SpaceTabs } from "@/components/spaces/space-tabs"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { PageHeader } from "@/components/page/page-kit"
import { CRIT_SOFT, PENDING_STRIPES, ROUND_ICON, SEG, segButton } from "@/components/attendance/time-styles"
import { cn } from "@/lib/utils"

import { FloorNowPanel } from "./_components/floor-now-panel"
import { LeaveWallchart } from "./_components/leave-wallchart"
import { useScheduleAndTimeOffPage } from "./_hooks/use-schedule-and-time-off-page"
import { RequestSummary } from "./_components/request-summary"
import type { PickedDay } from "./_components/day-hours-form"
import { useAuth } from "@/contexts/auth-context"

// The drawer is a decision somebody may never open — loaded when they do.
const LeaveDecisionDrawer = dynamic(
  () => import("./_components/leave-decision-drawer").then((m) => m.LeaveDecisionDrawer),
  { ssr: false },
)

export default function ScheduleAndTimeOffPage() {
  const { t } = useTranslation()
  const {
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
  const { user } = useAuth()
  // "Change hours for this day": the person and day whose form is open (rota permission only).
  const [picked, setPicked] = useState<PickedDay | null>(null)
  const pickDay = (pick: Omit<PickedDay, "self">) => {
    setSelectedId(null)
    // Nobody sets their own day — except an administrator (the server's own-decision rule).
    setPicked({ ...pick, self: pick.personId === user?.id && user?.role !== "ADMIN" })
  }

  if (!canManage) {
    return (
      <div className="min-h-full">
        <div className={PAGE_SHELL}>
          <div className="rounded-[22px] border border-border bg-card p-12 text-center shadow-shell">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-shell-crit" />
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
      <div className="min-h-full">
        <div className={PAGE_SHELL}>
          <PageHeader
            tour="page-availability"
            title={t("technicians.availabilityPage.title")}
            subtitle={
              <>
                {t("cover.page.subtitle", "Who is on the floor now, and who is asking to be off later.")}
                {/* A quiet way in to the starting balances — inline, so the header keeps its shape. */}
                {opensOpening && (
                  <>
                    {" · "}
                    <Link
                      href="/members/leave-opening"
                      className="underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {t("leaveLedger.opening.link")}
                    </Link>
                  </>
                )}
              </>
            }
            actions={
              <>
                <div className={SEG} role="group">
                  {(["fortnight", "month"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={range === r}
                      onClick={() => setRange(r)}
                      className={segButton(range === r)}
                    >
                      {r === "fortnight" ? t("cover.range.fortnight", "2 weeks") : t("cover.range.month", "Month")}
                    </button>
                  ))}
                </div>

                {/* The calendar's counterpart to its Team button — always here, opening on the period on screen. */}
                <Button asChild variant="outline" size="pill">
                  <Link href={`/calendar?date=${format(anchor, "yyyy-MM-dd")}`}>
                    <CalendarDays />
                    {t("nav.sidebar.calendar")}
                  </Link>
                </Button>
                <Button variant="outline" size="pill" onClick={() => setAnchor(new Date())}>
                  {t("common.today")}
                </Button>
                <button
                  type="button"
                  className={ROUND_ICON}
                  onClick={() => step(-1)}
                  aria-label={t("common.previous", "Previous")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[10.5rem] text-center text-sm font-semibold tabular-nums text-foreground">
                  {rangeLabel}
                </span>
                <button
                  type="button"
                  className={ROUND_ICON}
                  onClick={() => step(1)}
                  aria-label={t("common.next", "Next")}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            }
          />

          {/*
            A failed read must never look like an empty organization.

            Both of these render "nothing" on error — no roster, no bars — which
            is exactly what a company with nobody in it looks like. That is how a
            missing database column presented itself as "the page is empty", and
            it cost a round trip to diagnose something the screen already knew.
          */}
          {loadError && (
            <div className={cn("mb-4 flex items-start gap-3 rounded-2xl p-4", CRIT_SOFT)}>
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t("cover.error.title", "This page could not load")}</p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  {loadError.message || t("cover.error.generic", "The server did not answer.")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full"
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

          <RequestSummary summary={summary} />

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
              picked={picked}
              onPickDay={canDecide ? pickDay : undefined}
              onClosePick={() => setPicked(null)}
              // `!space` counts as loading: until a workspace is resolved the
              // chart has nothing to draw, and its empty state would otherwise
              // flash "nobody to show" at somebody whose data is on its way.
              isLoading={floorQuery.isLoading || leaveQuery.isLoading || !space}
            />
          </div>

          <div
            data-tour="avail-legend"
            className="flex flex-wrap items-center justify-center gap-6 py-3 text-xs text-muted-foreground"
          >
            <span className="inline-flex items-center gap-2">
              <i className="h-3 w-5 rounded-[4px] bg-shell-accent" />
              {t("common.approved")}
            </span>
            <span className="inline-flex items-center gap-2">
              <i className={"h-3 w-5 rounded-[4px] " + PENDING_STRIPES} />
              {t("cover.legend.pending", "Pending — yours to decide")}
            </span>
            <span className="inline-flex items-center gap-2">
              <i
                className={
                  "inline-flex h-4 items-center rounded-full border border-dashed " +
                  "border-current bg-card px-1 text-shell-warn"
                }
              >
                <House className="h-2.5 w-2.5" />
              </i>
              {t("requests.legendNotLeave")}
            </span>
            <span>{t("cover.legend.counts", "Cover counts only people rostered that day")}</span>
          </div>
        </div>
      </div>

      {drawerMounted && (
        <LeaveDecisionDrawer
          request={selected}
          canManage={canDecide}
          onClose={() => setSelectedId(null)}
          onChangeHours={canDecide ? pickDay : undefined}
        />
      )}
    </TooltipProvider>
  )
}

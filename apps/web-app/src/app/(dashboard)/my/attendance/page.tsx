"use client"

import { OutsideWaiting } from "./_components/outside-waiting"
import { useTranslation } from "react-i18next"
import { ListChecks } from "lucide-react"
import { WorkLogTimeline } from "@/components/attendance/worklog-timeline"
import { cn } from "@/lib/utils"
import { RestPanel } from "@/components/attendance/rest-panel"
import { UnconfirmedClockOutCard } from "@/components/attendance/unconfirmed-clock-out-card"
import { PageNotice } from "@/components/ui/empty-note"
import { PageHeader, Panel } from "@/components/page/page-kit"
import { useMyAttendancePage } from "./_hooks/use-my-attendance-page"
import { RangeField } from "./_components/range-field"
import { ShiftClockCard } from "./_components/shift-clock-card"
import { HoursCard } from "./_components/hours-card"
import { ShiftHistory } from "./_components/shift-history"

export default function MyAttendancePage() {
  const { t } = useTranslation()
  const {
    canSee,
    clockedIn,
    activeEntry,
    locations,
    pending,
    startClockIn,
    clockOut,
    pickerProps,
    earlyProps,
    period,
    setPeriod,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    range,
    effectiveRange,
    isLoading,
    entries,
  } = useMyAttendancePage()

  if (!canSee) {
    return <PageNotice>{t("attendance.my.noAccess")}</PageNotice>
  }

  return (
    <div>
      <PageHeader
        tour="page-my-attendance"
        title={t("nav.myShifts", "My shifts")}
        subtitle={t("attendance.my.subtitle")}
      />

      {/*
        A shift left open and closed with a temporary time, waiting for the
        member's real one. The email about it links here. Renders nothing
        when there is none.
      */}
      <UnconfirmedClockOutCard className="mb-6" />

      {/* Status + summary */}
      <div className="mb-6 grid grid-cols-1 gap-3.5 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <ShiftClockCard
          clockedIn={clockedIn}
          activeEntry={activeEntry}
          locations={locations}
          pending={pending}
          startClockIn={startClockIn}
          clockOut={clockOut}
          pickerProps={pickerProps}
          earlyProps={earlyProps}
        />
        <HoursCard effectiveRange={effectiveRange} entries={entries} />
      </div>

      <OutsideWaiting />

      {/*
        The rests planned for the shift that is running.

        Only while clocked in, and only when there are any: a workspace that
        plans no rests shows nothing here, which is exactly how it behaved before
        rests existed.
      */}
      {clockedIn && Array.isArray(activeEntry?.breakPlan) && activeEntry.breakPlan.length > 0 && (
        <RestPanel
          className="mb-6"
          plan={activeEntry.breakPlan as never}
          activeBreak={activeEntry.breaks?.find((b) => !b.endedAt) ?? null}
        />
      )}

      {/* Active-session work log — jot down what you do; becomes the clock-out summary. */}
      {clockedIn && activeEntry?.id && (
        <Panel as="div" className="mb-6 p-5">
          <div className="mb-1 flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
            <ListChecks className="h-4 w-4 text-shell-accent" /> {t("worklog.myTitle", "What I'm doing today")}
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            {t(
              "worklog.myHint",
              "Note what you finish through the shift (add a photo if useful) — it " +
                "becomes your clock-out summary.",
            )}
          </p>
          <WorkLogTimeline entryId={activeEntry.id} editable />
        </Panel>
      )}

      {/* History, and the window it belongs to */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 data-tour="my-attn-history" className="text-[15px] font-semibold text-foreground">
          {t("attendance.my.recentEntries")}
          <span className="ml-2 font-normal text-muted-foreground tabular-nums">{entries.length}</span>
        </h2>

        {/* The house segmented control, as used by the customers list. */}
        <div className="inline-flex rounded-full bg-shell-chip p-1">
          {(["7", "30", "custom"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors",
                period === p
                  ? "bg-card font-semibold text-foreground shadow-shell"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p === "7"
                ? t("attendance.my.period7", "7 days")
                : p === "30"
                  ? t("attendance.my.period30", "30 days")
                  : t("attendance.my.periodCustom", "Custom")}
            </button>
          ))}
        </div>
      </div>

      {/*
        Two dates, and only when they are asked for.

        Revealed by the Custom tab rather than sitting there permanently: most
        visits are "how was my week", and a pair of empty date fields above every
        one of them is furniture nobody needed.
      */}
      {period === "custom" && (
        <Panel as="div" className="mb-4 flex flex-wrap items-center gap-3 p-4">
          <RangeField
            from={customFrom}
            to={customTo}
            onChange={(f, t2) => {
              setCustomFrom(f)
              setCustomTo(t2)
            }}
            placeholder={t("attendance.my.pickRange", "Pick a date range")}
          />
          {!range && (
            <p className="text-xs text-muted-foreground">
              {t("attendance.my.pickBoth", "Pick both dates — showing the last 7 days until then.")}
            </p>
          )}
        </Panel>
      )}

      <ShiftHistory isLoading={isLoading} entries={entries} effectiveRange={effectiveRange} />
    </div>
  )
}

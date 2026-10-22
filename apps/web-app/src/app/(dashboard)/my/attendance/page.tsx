"use client"

import { useTranslation } from "react-i18next"
import { ListChecks } from "lucide-react"
import { WorkLogTimeline } from "@/components/attendance/worklog-timeline"
import { cn } from "@/lib/utils"
import { RestPanel } from "@/components/attendance/rest-panel"
import { UnconfirmedClockOutCard } from "@/components/attendance/unconfirmed-clock-out-card"
import { PageNotice } from "@/components/ui/empty-note"
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
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 data-tour="page-my-attendance" className="text-2xl font-semibold text-foreground">
          {t("nav.myShifts", "My shifts")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("attendance.my.subtitle")}</p>
      </div>

      {/*
        A shift left open and closed with a temporary time, waiting for the
        member's real one. The email about it links here. Renders nothing
        when there is none.
      */}
      <UnconfirmedClockOutCard className="mb-6" />

      {/* Status + summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
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
        <div className="mb-6 rounded-2xl border border-border bg-card p-5">
          <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <ListChecks className="h-4 w-4 text-primary" /> {t("worklog.myTitle", "What I'm doing today")}
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            {t(
              "worklog.myHint",
              "Note what you finish through the shift (add a photo if useful) — it " +
                "becomes your clock-out summary.",
            )}
          </p>
          <WorkLogTimeline entryId={activeEntry.id} editable />
        </div>
      )}

      {/* History, and the window it belongs to */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 data-tour="my-attn-history" className="text-sm font-semibold text-foreground">
          {t("attendance.my.recentEntries")}
          <span className="ml-2 font-normal text-muted-foreground tabular-nums">{entries.length}</span>
        </h2>

        {/* The house segmented control, as used by the customers list. */}
        <div className="inline-flex rounded-lg bg-muted p-0.5">
          {(["7", "30", "custom"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                period === p
                  ? "bg-background text-foreground shadow-sm"
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
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
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
        </div>
      )}

      <ShiftHistory isLoading={isLoading} entries={entries} effectiveRange={effectiveRange} />
    </div>
  )
}

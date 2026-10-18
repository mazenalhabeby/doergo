"use client"

import { MapPin, Home, ListChecks } from "lucide-react"
import { WorkLogTimeline } from "@/components/worklog-timeline"
import { cn } from "@/lib/utils"
import { countryFromTz } from "@hbcfield/shared/client"

import { RestPanel } from "@/components/attendance/rest-panel"
import { UnconfirmedClockOutCard } from "@/components/attendance/unconfirmed-clock-out-card"
import { deriveAttendanceFlags } from "@/lib/attendance-status"
import { useMyAttendancePage } from "./use-my-attendance-page"
import { duration, fmtDate, RangeField } from "./my-attendance-page-helpers"
import { MyAttendancePageView } from "./my-attendance-page-view"
import { MyAttendancePageMy } from "./my-attendance-page-my"
import { PageNotice } from "@/components/ui/empty-note"

/** Local calendar day as yyyy-MM-dd — never via toISOString, which shifts to UTC. */

export default function MyAttendancePage() {
  const vm = useMyAttendancePage()
  const {
    t,
    formatTime,
    locale,
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
  } = vm

  if (!canSee) {
    return (
      <PageNotice>
        {t("attendance.my.noAccess")}
      </PageNotice>
    )
  }

  /*
    The chosen window, as days rather than as a list.

    A column of rows answers "what did I do on the 3rd"; it does not answer "how
    did the month go", which is the question somebody opens their own shifts to
    ask. Both come from the one request — no second call for the totals.

    Bars stay readable at any length: a fortnight is drawn day by day, a quarter
    week by week. Thirty hairlines would be a texture, not information.
  */
  const { window_, shiftTarget } = MyAttendancePageView({ locale, clockedIn, activeEntry, effectiveRange, entries })

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 data-tour="page-my-attendance" className="text-2xl font-semibold text-foreground">{t("nav.myShifts", "My shifts")}</h1>
        <p className="text-sm text-muted-foreground">{t("attendance.my.subtitle")}</p>
      </div>

      {/*
        A shift left open and closed with a temporary time, waiting for the
        member's real one. The email about it links here. Renders nothing
        when there is none.
      */}
      <UnconfirmedClockOutCard className="mb-6" />

      {/* Status + summary */}
      <MyAttendancePageMy vm={vm} shiftTarget={shiftTarget} window_={window_} />

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
          <p
            className="mb-3 text-xs text-muted-foreground">{t(
              "worklog.myHint",
              ("Note what you finish through the shift (add a photo if useful) — it " + "becomes your clock-out summary."))}</p>
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
                period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
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

      {isLoading ? (
        <div
          className={"rounded-2xl border border-border bg-card py-12 text-center text-sm " +
            "text-muted-foreground"}>{t("common.loading")}</div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          {/* Which window is empty — "no records" alone reads as "you have never
              worked here", when it usually means "not in these dates". */}
          {t("attendance.my.noneInRange", "No shifts between {{from}} and {{to}}.", {
            from: new Date(`${effectiveRange.startDate}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" }),
            to: new Date(`${effectiveRange.endDate}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" }),
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {entries.map((e, i) => (
            <div key={e.id} className={`flex items-center gap-4 px-5 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
              <div className="w-28 shrink-0">
                <div className="text-sm font-medium text-foreground">{fmtDate(e.clockInAt)}</div>
                {countryFromTz((e.timezone ?? e.location?.timezone), locale) && (
                  <div className="text-xs text-muted-foreground">
                    {countryFromTz((e.timezone ?? e.location?.timezone), locale)}
                  </div>
                )}
              </div>
              <div className="flex-1 text-sm text-muted-foreground">
                {/* A dot before the times: running, or done. Colour is the
                    only thing that has to be read at a glance here. */}
                <span
                  className={cn(
                    "mr-2 inline-block size-1.5 rounded-full align-middle",
                    e.clockOutAt ? "bg-muted-foreground/40" : "bg-emerald-500",
                  )}
                />
                {formatTime(
                  e.clockInAt,
                  (e.timezone ??
                    e.location?.timezone))} → {e.clockOutAt
                      ? formatTime(e.clockOutAt, (e.timezone ?? e.location?.timezone))
                      : <span className="text-green-600">{t("attendance.my.active")}</span>}
                {/*
                  An away day still belongs to a workspace, so it names the site
                  AND says they were away from it. The old branch showed one or
                  the other, which lost the site on every remote day — the very
                  fact the timesheet is grouped by.
                */}
                {e.location?.name ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {e.isRemote ? <Home className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                    {e.location.name}
                    {e.isRemote ? ` · ${t("attendance.my.away", "away")}` : ""}
                    {e.isRemote && e.clockInPlace ? ` · ${e.clockInPlace}` : ""}
                  </span>
                ) : e.isRemote ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Home className="h-3 w-3" />{t("attendance.my.remote", "Remote")}
                    {e.clockInPlace ? ` · ${e.clockInPlace}` : ""}
                  </span>
                ) : null}
              </div>
              {/*
                Why a shift is worth a second look — late, overtime, no
                clock-out. The member already sees these on their manager's
                screen; hiding them here meant the first they knew of a query
                was somebody asking about it.
              */}
              {!!e.flagReasons?.length && (
                <div className="hidden shrink-0 gap-1 sm:flex">
                  {/*
                    The one flag mapping (lib/attendance-status): what asks for a
                    look comes first and stays amber; what only says how the
                    entry was made (automatic clock, recorded offline) is neutral.
                  */}
                  {deriveAttendanceFlags(e).slice(0, 2).map((f) => (
                    <span
                      key={f.key}
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                        f.tone === "muted"
                          ? "border-border bg-muted text-muted-foreground"
                          : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {t(f.labelKey, { defaultValue: f.fallback })}
                    </span>
                  ))}
                </div>
              )}
              <div className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{duration(e.clockInAt, e.clockOutAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

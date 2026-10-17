"use client"

import { Clock, CircleDot, LogIn, LogOut, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatDuration } from "@hbcfield/shared/client"
import { ClockInPicker } from "@/components/clock-in-picker"
import { ClockOutEarlyDialog } from "@/components/attendance/clock-out-early-dialog"
import { LiveShift } from "./my-attendance-page-helpers"
import type { MyAttendancePageState } from "./use-my-attendance-page"
import type { MyAttendancePageView } from "./my-attendance-page-view"

/** Part of MyAttendancePage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function MyAttendancePageMy(
  {
    vm,
    shiftTarget,
    window_
  }: {
    vm: MyAttendancePageState;
    shiftTarget: ReturnType<typeof MyAttendancePageView>['shiftTarget'];
    window_: ReturnType<typeof MyAttendancePageView>['window_']
  }) {
  const {
    clockedIn,
    t,
    activeEntry,
    formatTime,
    clockOut,
    pending,
    startClockIn,
    locations,
    pickerProps,
    earlyProps,
    canSee,
  } = vm
  if ((!canSee)) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
      <div className="rounded-2xl border border-border bg-card p-5" data-tour="my-attn-clock">
        <div data-tour="my-attn-status">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <CircleDot className={`h-4 w-4 ${clockedIn ? "text-green-600" : "text-slate-400"}`} />
            {t("attendance.my.currentStatus")}
          </div>
          {clockedIn && activeEntry?.clockInAt ? (
            <>
              <div className="mt-3">
                <LiveShift since={activeEntry.clockInAt} target={shiftTarget} />
              </div>
              {/*
                Both clocks, when they differ.

                Arriving twenty minutes early is recorded and is not paid, and
                a member who reads that here does not have to discover it on a
                payslip and ask.
              */}
              {activeEntry.countedStartAt &&
                new Date(activeEntry.countedStartAt).getTime() !== new Date(activeEntry.clockInAt).getTime() && (
                  <p
                    className={"mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 " +
                      "py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 " +
                      "dark:text-emerald-400"}>
                    <Clock className="h-3 w-3" />
                    {t("attendance.my.paidFrom", "Counted from {{time}}", {
                      time: formatTime(activeEntry.countedStartAt, activeEntry.timezone ?? activeEntry.location?.timezone),
                    })}
                  </p>
                )}
              <p className="mt-2 text-xs text-muted-foreground">
                {t("attendance.my.sinceAt", "Since {{time}}", {
                  time: formatTime(activeEntry.clockInAt, activeEntry.timezone ?? activeEntry.location?.timezone),
                })}
                {/*
                  The workspace comes first, then whether they are at it.

                  An away day belongs to a workspace now — it is not filed
                  somewhere called "Remote" — so naming the site and then
                  qualifying it is the honest order. Reading only "Remote" hid
                  which site the day was worked FOR, which is the fact the
                  timesheet is grouped by.
                */}
                {activeEntry.location?.name ? ` · ${activeEntry.location.name}` : ""}
                {activeEntry.isRemote
                  ? ` · ${t("attendance.my.away", "away")}${activeEntry.clockInPlace ? ` · ${activeEntry.clockInPlace}` : ""}`
                  : ""}
              </p>
            </>
          ) : (
            <p className="mt-2 text-lg font-semibold text-foreground">{t("attendance.my.clockedOut")}</p>
          )}
        </div>

        {clockedIn ? (
          <Button onClick={clockOut} disabled={pending} variant="outline" className="mt-4 w-full">
            {pending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />{t("attendance.my.locating", "Getting your location…")}</>
            ) : (
              <><LogOut className="h-4 w-4" />{t("attendance.my.clockOut", "Clock Out")}</>
            )}
          </Button>
        ) : (
          <div className="mt-4 space-y-2">
            <Button
              onClick={startClockIn}
              disabled={pending || locations.length === 0}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {pending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />{t("attendance.my.locating", "Getting your location…")}</>
              ) : (
                <><LogIn className="h-4 w-4" />{t("attendance.my.clockIn", "Clock In")}</>
              )}
            </Button>
            {/*
              Nowhere to clock in is a real state and it used to surface as an
              error toast AFTER the member had already granted location and
              waited for a fix. Said up front instead.
            */}
            {locations.length === 0 && (
              <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                {t(
                  "attendance.my.noAssignedLocations",
                  "You are not assigned to a workspace yet, so there is nowhere to clock in. Ask your admin to add you to one.",
                )}
              </p>
            )}
          </div>
        )}
        {/* Both dialogs come from the same hook, so the navbar behaves identically. */}
        <ClockInPicker {...pickerProps} />
        <ClockOutEarlyDialog {...earlyProps} />
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          {t(
            "attendance.my.gpsHintOneButton",
            ("Uses your location to pick your workspace and check you are there. Where " +
              "you are working through the day is worked out for you."))}
        </p>
      </div>
      {/*
        The window, as bars — and the two numbers that describe it.

        "Hours in the last 60 entries" was a true number that answered no
        question anybody has. This says how the chosen stretch went, which day
        was heavy, and what a working day averaged.
      */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Clock className="h-4 w-4 text-slate-400" />
          {t("attendance.my.hoursIn", "Hours worked")}
        </div>

        <div className="mt-2 flex items-baseline gap-3">
          <p className="text-2xl font-semibold tabular-nums text-foreground">{formatDuration(window_.worked)}</p>
          {window_.daysWorked > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("attendance.my.overDays", "{{days}} days · {{avg}} avg", {
                days: window_.daysWorked,
                avg: formatDuration(window_.worked / window_.daysWorked),
              })}
            </p>
          )}
        </div>

        <div className="mt-4 flex items-end justify-between gap-1.5" aria-hidden>
          {window_.buckets.map((b) => {
            const pct = b.minutes / window_.peak
            const isNow = !window_.groupWeekly && b.key === window_.todayKey
            return (
              <div key={b.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <div className="flex h-16 w-full items-end">
                  <div
                    className={cn(
                      "w-full rounded-md transition-[height] duration-700 ease-out",
                      b.minutes === 0 ? "bg-muted" : isNow ? "bg-primary" : "bg-primary/35",
                    )}
                    style={{ height: `${Math.max(b.minutes === 0 ? 4 : 10, pct * 100)}%` }}
                    title={`${b.label} · ${formatDuration(b.minutes)}`}
                  />
                </div>
                <span
                  className={cn(
                    "truncate text-[10px] leading-none",
                    isNow ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {b.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

"use client"

import { Clock, LogIn, LogOut, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { ComponentProps } from "react"
import type { TimeEntry } from "@hbcfield/shared"
import { useTimeFormat } from "@/hooks"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/page/page-kit"
import { ClockInPicker } from "@/components/attendance/clock-in-picker"
import { ClockOutEarlyDialog } from "@/components/attendance/clock-out-early-dialog"
import { AskMoreTime } from "@/components/attendance/ask-more-time"
import { mayClockInRemotely } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { LiveShift } from "./live-shift"

/** The member's clock: the running shift (or "clocked out") and the one button that changes it. */
export function ShiftClockCard({
  clockedIn,
  activeEntry,
  locations,
  pending,
  startClockIn,
  clockOut,
  pickerProps,
  earlyProps,
}: {
  clockedIn: boolean
  activeEntry: TimeEntry | undefined
  locations: ComponentProps<typeof ClockInPicker>["locations"]
  pending: boolean
  startClockIn: () => void
  clockOut: () => void
  pickerProps: ComponentProps<typeof ClockInPicker>
  earlyProps: ComponentProps<typeof ClockOutEarlyDialog>
}) {
  const { user } = useAuth()
  const canClockInRemotely = mayClockInRemotely(user as never)
  const { t } = useTranslation()
  const { formatTime } = useTimeFormat()
  /*
    How far through today's shift, when the shift has a known end.

    `expectedClockOutAt` is set at clock-in for a scheduled space and null for an
    open-hours one — so the ring appears where there is a real target and the
    elapsed time stands alone where there is not. Inventing an eight-hour default
    would draw a progress bar against a number nobody agreed to.
  */
  const shiftTarget = (() => {
    if (!clockedIn || !activeEntry?.clockInAt || !activeEntry.expectedClockOutAt) return null
    const start = new Date(activeEntry.clockInAt).getTime()
    const end = new Date(activeEntry.expectedClockOutAt).getTime()
    if (!(end > start)) return null
    return { start, totalMins: (end - start) / 60000 }
  })()

  return (
    <div data-tour="my-attn-clock">
      <Panel as="div" className="h-full px-[22px] py-5">
        <div data-tour="my-attn-status">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <i className={cn("size-2 rounded-full", clockedIn ? "bg-shell-live" : "bg-muted-foreground/40")} />
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
                    className={
                      "mt-2 inline-flex items-center gap-1.5 rounded-full bg-shell-accent-soft px-2.5 " +
                      "py-1 text-[11px] font-medium text-shell-accent"
                    }
                  >
                    <Clock className="h-3 w-3" />
                    {t("attendance.my.paidFrom", "Counted from {{time}}", {
                      time: formatTime(
                        activeEntry.countedStartAt,
                        activeEntry.timezone ?? activeEntry.location?.timezone,
                      ),
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
            <p className="mt-2 text-[32px] font-semibold leading-[1.05] tracking-[-0.045em] text-foreground">
              {t("attendance.my.clockedOut")}
            </p>
          )}
        </div>

        {clockedIn ? (
          <div className="mt-4 space-y-2">
            <Button onClick={clockOut} disabled={pending} variant="outline" size="pillLg" className="w-full">
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("attendance.my.locating", "Getting your location…")}
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" />
                  {t("attendance.my.clockOut", "Clock Out")}
                </>
              )}
            </Button>
            <div className="flex justify-center">
              <AskMoreTime entry={activeEntry} />
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <Button
              onClick={startClockIn}
              // Nowhere to clock in, unless they may clock in away — what the navbar has always done (C4).
              disabled={pending || (locations.length === 0 && !canClockInRemotely)}
              size="pillLg"
              className="w-full"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("attendance.my.locating", "Getting your location…")}
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  {t("attendance.my.clockIn", "Clock In")}
                </>
              )}
            </Button>
            {/*
            Nowhere to clock in is a real state and it used to surface as an
            error toast AFTER the member had already granted location and
            waited for a fix. Said up front instead.
          */}
            {locations.length === 0 && !canClockInRemotely && (
              <p className="text-[11px] leading-snug text-shell-warn">
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
            "Uses your location to pick your workspace and check you are there. Where " +
              "you are working through the day is worked out for you.",
          )}
        </p>
      </Panel>
    </div>
  )
}

"use client"

import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useBillingLock, useClockIn } from "@/hooks"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { formatDuration, hasAccessModule } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { ClockInPicker } from "@/components/attendance/clock-in-picker"
import { ClockOutEarlyDialog } from "@/components/attendance/clock-out-early-dialog"
import { AskMoreTime } from "@/components/attendance/ask-more-time"
import { Icon } from "@/components/ui/icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useTimeFormat } from "@/hooks/use-time-format"

/** Whole minutes since an ISO timestamp, ticking every 20 seconds — the card shows hours and minutes. */
function useElapsedMinutes(sinceIso?: string | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!sinceIso) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 20_000)
    return () => clearInterval(id)
  }, [sinceIso])
  if (!sinceIso) return 0
  return Math.max(0, Math.floor((now - new Date(sinceIso).getTime()) / 60_000))
}

/**
 * The shift card at the bottom of the sidebar (web redesign, 2026-10): clocked in → where, for how long, and
 * Clock out; clocked out → Clock in. On the collapsed rail, the same as one round button.
 *
 * Presentation only. Everything about how a clock-in works — the status, the workspaces this member may use,
 * choosing between them, the geolocation failures — belongs to `useClockIn`, which the shift page mounts too.
 *
 * ⚠️ This file used to carry its own copy of all of it, and the copies drifted: the workspace picker was added
 * to the page and not here, so the same member choosing "On-site" from the navbar was still silently clocked
 * in at whichever site the GPS liked. Behaviour that exists twice gets fixed once.
 *
 * Shown only for members with clock access (an admin who switched their own clock off has none — A7).
 */
export function ClockWidget({ compact = false }: { compact?: boolean }) {
  // Clocking in is a write; the server returns 402 while the account is
  // read-only. Refusing here means somebody does not press it, wait, and then
  // read an error about billing they were not looking for.
  const { locked: billingLocked, reason: billingLockReason } = useBillingLock()
  const { user } = useAuth()
  const { t } = useTranslation()
  const { formatTime } = useTimeFormat()
  // Clock access is module-driven, not role-locked (see hasAccessModule).
  const canClock = !!user && hasAccessModule(user, "clock")

  const { clockedIn, activeEntry, locations, pending, startClockIn, clockOut, pickerProps, earlyProps } = useClockIn({
    enabled: canClock,
  })
  const minutes = useElapsedMinutes(clockedIn ? (activeEntry?.clockInAt ?? null) : null)

  const where = activeEntry?.isRemote
    ? `${t("attendance.my.remote", "Remote")}${activeEntry.clockInPlace ? ` · ${activeEntry.clockInPlace}` : ""}`
    : activeEntry?.location?.name || ""

  if (!canClock) return null

  // The shift's planned end, in the ENTRY's zone first (as the early-clock-out dialog says it), when there is
  // one — a no-shift day's daily limit is an allowance, not an end.
  const plannedEnd =
    activeEntry?.expectedClockOutAt && !activeEntry.endIsDailyLimit ? activeEntry.expectedClockOutAt : null
  const endsAt = plannedEnd
    ? formatTime(plannedEnd, activeEntry?.timezone ?? activeEntry?.location?.timezone ?? undefined)
    : null
  // Before clocking in: the one place they would clock in, or how many there are to choose from (read after
  // the first paint — the line simply appears).
  const places =
    locations.length === 1
      ? locations[0]!.name
      : locations.length > 1
        ? t("attendance.my.placesToChoose", { count: locations.length, defaultValue: "{{count}} workspaces" })
        : ""

  const clockedInLabel = t("attendance.my.clockedIn", "Clocked in")
  const title = `${clockedInLabel} · ${formatDuration(minutes)}`
  const spinner = <Loader2 className="size-4 animate-spin" />
  const clockOutLabel = t("attendance.my.clockOut", "Clock Out")
  const clockInLabel = t("attendance.my.clockIn", "Clock In")

  if (clockedIn) {
    const card = (
      <div data-on className="clock-aurora flex h-14 items-center gap-2 rounded-[18px] pl-2 pr-2" title={title}>
        <span className="clock-aurora-disc size-10">
          <Icon name="clockRunning" size={22} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <b className="font-shell-mono text-[15px] font-semibold tabular-nums">{formatDuration(minutes)}</b>
          <span className="truncate text-[11.5px] text-shell-soft">
            {[where, endsAt && t("attendance.my.untilTime", { time: endsAt, defaultValue: "until {{time}}" })]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <AskMoreTime entry={activeEntry} compact />
        <button
          type="button"
          // Never billing-locked: the server lets a shift end on a read-only account (@AllowWhenLocked).
          disabled={pending}
          onClick={clockOut}
          aria-label={clockOutLabel}
          className={cn(
            "icon-motion inline-flex h-8 shrink-0 items-center gap-1 rounded-[11px] pl-2 pr-2.5 text-xs font-semibold",
            "clock-out disabled:opacity-60",
          )}
        >
          {pending ? spinner : <Icon name="clockOut" size={14} />}
          {t("attendance.my.out", "Out")}
        </button>
      </div>
    )
    return (
      <>
        {/* Short of the shift end, Clock Out asks first — the dialog must be HERE, where it is opened. */}
        <ClockOutEarlyDialog {...earlyProps} />
        {compact ? (
          /*
            On the rail the stopwatch is the STATUS, not the action: a click opens the same card as the open
            sidebar (time, place, Out). Clocking out on one click of a status mark ended shifts by accident.
          */
          <Popover>
            <PopoverTrigger
              data-on
              title={`${title}${where ? ` · ${where}` : ""}`}
              aria-label={title}
              className="clock-aurora mx-auto grid size-12 place-items-center rounded-2xl text-shell-accent"
            >
              <Icon name="clockRunning" size={22} />
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="end"
              sideOffset={12}
              className="w-[260px] rounded-[20px] border-0 bg-transparent p-0 shadow-none"
            >
              {card}
            </PopoverContent>
          </Popover>
        ) : (
          card
        )}
      </>
    )
  }

  return (
    <>
      {/* One button. Where they are is decided from evidence, not chosen here. */}
      <ClockInPicker {...pickerProps} />
      <button
        type="button"
        // ⚠️ This button alone used to ignore the billing lock, so the one
        // member who cannot clock in remotely was the one who got a 402.
        disabled={pending || billingLocked}
        title={billingLocked ? billingLockReason : clockInLabel}
        aria-label={compact ? clockInLabel : undefined}
        onClick={startClockIn}
        className={cn(
          "clock-aurora icon-motion disabled:opacity-60",
          compact
            ? "mx-auto grid size-12 place-items-center rounded-2xl"
            : "flex h-14 w-full items-center gap-2.5 rounded-[18px] px-2",
        )}
      >
        <span className={cn("clock-aurora-disc", compact ? "size-9" : "size-10")}>
          {pending ? spinner : <Icon name="clockIn" size={22} />}
        </span>
        {!compact && (
          <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
            <b className="text-[14.5px] font-semibold">{clockInLabel}</b>
            {places && <span className="truncate text-[11.5px] opacity-80">{places}</span>}
          </span>
        )}
      </button>
    </>
  )
}

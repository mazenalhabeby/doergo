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
  // Clock access is module-driven, not role-locked (see hasAccessModule).
  const canClock = !!user && hasAccessModule(user, "clock")

  const { clockedIn, activeEntry, pending, startClockIn, clockOut, pickerProps, earlyProps } = useClockIn({
    enabled: canClock,
  })
  const minutes = useElapsedMinutes(clockedIn ? (activeEntry?.clockInAt ?? null) : null)

  const where = activeEntry?.isRemote
    ? `${t("attendance.my.remote", "Remote")}${activeEntry.clockInPlace ? ` · ${activeEntry.clockInPlace}` : ""}`
    : activeEntry?.location?.name || ""

  if (!canClock) return null

  const clockedInLabel = t("attendance.my.clockedIn", "Clocked in")
  const title = `${clockedInLabel} · ${formatDuration(minutes)}`
  const spinner = <Loader2 className="size-4 animate-spin" />

  if (clockedIn) {
    return (
      <>
        {/* Short of the shift end, Clock Out asks first — the dialog must be HERE, where it is opened. */}
        <ClockOutEarlyDialog {...earlyProps} />
        {compact ? (
          <button
            type="button"
            onClick={clockOut}
            disabled={pending}
            title={`${title}${where ? ` · ${where}` : ""} — ${t("attendance.my.clockOut", "Clock Out")}`}
            aria-label={t("attendance.my.clockOut", "Clock Out")}
            className="relative mx-auto grid size-11 place-items-center rounded-2xl bg-shell-accent-soft text-shell-accent"
          >
            {pending ? spinner : <Icon name="clockOut" size={18} />}
            <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-shell-live" />
          </button>
        ) : (
          <div className="flex items-center gap-2.5 rounded-2xl bg-shell-accent-soft py-2.5 pl-3 pr-2.5">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-shell-live" />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <b className="truncate text-[13px] text-shell-ink">{title}</b>
              {where && <span className="truncate text-xs text-shell-soft">{where}</span>}
            </span>
            <AskMoreTime entry={activeEntry} compact />
            <button
              type="button"
              // Never billing-locked: the server lets a shift end on a read-only account (@AllowWhenLocked).
              disabled={pending}
              onClick={clockOut}
              className={cn(
                "h-[30px] shrink-0 rounded-full px-3 text-xs font-semibold text-shell-on-accent",
                "bg-[image:var(--shell-accent-fill)] disabled:opacity-60",
              )}
            >
              {pending ? spinner : t("attendance.my.clockOut", "Clock Out")}
            </button>
          </div>
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
        title={billingLocked ? billingLockReason : t("attendance.my.clockIn", "Clock In")}
        aria-label={compact ? t("attendance.my.clockIn", "Clock In") : undefined}
        onClick={startClockIn}
        className={cn(
          "flex items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-shell-on-accent",
          "bg-[image:var(--shell-accent-fill)] transition-opacity hover:opacity-90 disabled:opacity-60",
          compact ? "mx-auto size-11" : "h-11 w-full",
        )}
      >
        {pending ? spinner : <Icon name="clockIn" size={18} />}
        {!compact && t("attendance.my.clockIn", "Clock In")}
      </button>
    </>
  )
}

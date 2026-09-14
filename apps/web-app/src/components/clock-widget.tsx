"use client"

import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useBillingLock, useClockIn } from "@/hooks"
import { LogIn, LogOut, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { hasAccessModule } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { ClockInPicker } from "@/components/clock-in-picker"
import { ClockOutEarlyDialog } from "@/components/attendance/clock-out-early-dialog"

/** Live "HH:MM:SS" elapsed since an ISO timestamp, ticking every second. */
function useElapsed(sinceIso?: string | null): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!sinceIso) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [sinceIso])
  if (!sinceIso) return "00:00:00"
  const s = Math.max(0, Math.floor((now - new Date(sinceIso).getTime()) / 1000))
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

/**
 * Persistent clock-in/out control for the top navbar.
 *
 * Presentation only. Everything about how a clock-in works — the status, the
 * workspaces this member may use, choosing between them, the geolocation
 * failures — belongs to `useClockIn`, which the shift page mounts too.
 *
 * ⚠️ This file used to carry its own copy of all of it, and the copies drifted:
 * the workspace picker was added to the page and not here, so the same member
 * choosing "On-site" from the navbar was still silently clocked in at whichever
 * site the GPS liked. Behaviour that exists twice gets fixed once.
 *
 * Shown only for members with clock access. Clocked out → Clock In (plus Remote
 * when eligible). Clocked in → a live timer + Clock Out.
 */
export function ClockWidget() {
  // Clocking in is a write; the server returns 402 while the account is
  // read-only. Refusing here means somebody does not press it, wait, and then
  // read an error about billing they were not looking for.
  const { locked: billingLocked, reason: billingLockReason } = useBillingLock()
  const { user } = useAuth()
  const { t } = useTranslation()
  // Clock access is module-driven, not role-locked: anyone whose Access Profile
  // includes the `clock` module can punch in — including an admin/owner who also
  // works on site. It's optional (a button they can ignore), never required, and
  // an admin who shouldn't clock just has `clock` left out of their profile. The
  // backend already allows both ADMIN and EMPLOYEE clock-in.
  const canClock = !!user && hasAccessModule(user, "clock")

  const {
    clockedIn, activeEntry, pending, startClockIn, clockOut, pickerProps, earlyProps,
  } = useClockIn({
    enabled: canClock,
  })

  const elapsed = useElapsed(clockedIn ? activeEntry?.clockInAt ?? null : null)

  const where = activeEntry?.isRemote
    ? `${t("attendance.my.remote", "Remote")}${activeEntry.clockInPlace ? ` · ${activeEntry.clockInPlace}` : ""}`
    : activeEntry?.location?.name || ""

  if (!canClock) return null

  // ── Clocked in → live timer + Clock Out ─────────────────────────────
  if (clockedIn) {
    return (
      <div
        className="flex items-center gap-1.5 rounded-full border border-green-600/30 bg-green-600/10 pl-2.5 pr-1 py-0.5"
        title={where ? `${t("attendance.my.clockedIn", "Clocked in")} · ${where}` : t("attendance.my.clockedIn", "Clocked in")}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
        </span>
        <span className="text-xs font-semibold tabular-nums text-green-700 dark:text-green-400">{elapsed}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-2 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700"
          disabled={pending || billingLocked}
          title={billingLocked ? billingLockReason : undefined}
          onClick={clockOut}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><LogOut className="h-3.5 w-3.5" />{t("attendance.my.clockOut", "Clock Out")}</>}
        </Button>
      </div>
    )
  }

  return (
    <>
      {/* One button. Where they are is decided from evidence, not chosen here. */}
      <ClockInPicker {...pickerProps} />
      <ClockOutEarlyDialog {...earlyProps} />
      <Button
        size="sm"
        className="h-8 gap-1 bg-green-600 text-white hover:bg-green-700"
        // ⚠️ This button alone used to ignore the billing lock, so the one
        // member who cannot clock in remotely was the one who got a 402.
        disabled={pending || billingLocked}
        title={billingLocked ? billingLockReason : undefined}
        onClick={startClockIn}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        {t("attendance.my.clockIn", "Clock In")}
      </Button>
    </>
  )
}

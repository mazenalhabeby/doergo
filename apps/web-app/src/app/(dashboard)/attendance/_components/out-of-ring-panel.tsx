"use client"

import React from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { MapPin, Timer, Navigation } from "lucide-react"
import { personName, type GeofenceExcursion } from "@hbcfield/shared/client"

import { attendanceApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/user-avatar"
import { keys } from "@/lib/query-keys"
import { DecideInApprovals } from "@/components/approvals/decide-in-approvals"

// Format remaining ms as "M:SS" / "H:MM:SS".
function fmtRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/**
 * Approver surface for the geofence-excursion ("out of ring") workflow. Self-
 * contained: fetches its own active (PENDING/APPROVED) requests and mutates them.
 * Realtime refresh comes from use-realtime-sync invalidating ["geofence-excursions"].
 * Renders nothing when there's nothing to act on.
 */
/** Asking to be away is decided in Approvals; this panel shows who is out on agreed time. */
export function OutOfRingPanel() {
  const { t } = useTranslation()

  const { data: excursions = [] } = useQuery({
    queryKey: keys.attendance.activeExcursions(),
    queryFn: () => attendanceApi.listExcursions("active"),
    refetchInterval: 60_000, // safety net; realtime drives most updates
  })

  // 1s ticker so APPROVED countdowns update live.
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    if (!excursions.some((e) => e.status === "APPROVED")) return
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [excursions])

  const approved = excursions.filter((e) => e.status === "APPROVED")
  const waiting = <DecideInApprovals kinds={["away"]} className="mb-4" />
  if (approved.length === 0) return waiting

  return (
    <>
    {waiting}
    <div className="bg-card rounded-2xl border border-orange-200/60 dark:border-orange-500/25 shadow-sm mb-8 overflow-hidden">
      <div className="p-5 border-b border-orange-100 dark:border-orange-500/20 bg-orange-50/50 dark:bg-orange-500/5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400">
            <Navigation className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-orange-900 dark:text-orange-200">
              {t("attendance.outOfRing.title", "Out of the ring")}
            </h2>
            <p className="text-sm text-orange-700 dark:text-orange-300/80">
              {t(
                "attendance.outOfRing.desc",
                "Workers who left their work area and need a decision or are on approved time.",
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-orange-100 dark:divide-orange-500/15">
        {/* APPROVED — live countdown */}
        {approved.map((ex) => (
          <ApprovedRow key={ex.id} ex={ex} />
        ))}
      </div>
    </div>
    </>
  )
}

function ApprovedRow({ ex }: { ex: GeofenceExcursion }) {
  const { t } = useTranslation()
  const name = personName(ex.user) || t("attendance.unknownWorker", "Worker")
  const remainingMs = ex.expiresAt ? new Date(ex.expiresAt).getTime() - Date.now() : 0
  const expired = ex.timerExpired || remainingMs <= 0

  return (
    <div className="p-4 flex items-center gap-4 justify-between hover:bg-orange-50/30 dark:hover:bg-orange-500/5">
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar firstName={ex.user?.firstName} lastName={ex.user?.lastName} seed={ex.userId} size="md" />
        <div className="min-w-0">
          <p className="font-medium text-foreground truncate">{name}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="size-3" />
            {ex.space?.name ?? t("attendance.unknownLocation")}
            {ex.reason && ` · “${ex.reason}”`}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        {expired ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400 tabular-nums">
            <Timer className="size-3.5" />
            {t("attendance.outOfRing.timeExpired", "Time expired")}
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
              remainingMs < 5 * 60_000
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-green-500/10 text-green-600 dark:text-green-400",
            )}
          >
            <Timer className="size-3.5" />
            {fmtRemaining(remainingMs)} {t("attendance.outOfRing.left", "left")}
          </span>
        )}
      </div>
    </div>
  )
}

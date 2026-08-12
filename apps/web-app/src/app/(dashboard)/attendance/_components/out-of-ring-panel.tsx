"use client"

import React from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { MapPin, Check, X, Timer, Loader2, Navigation } from "lucide-react"
import { GEOFENCE_EXCURSION, type GeofenceExcursion } from "@hbcfield/shared/client"

import { attendanceApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/user-avatar"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
export function OutOfRingPanel({ canApprove }: { canApprove: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: excursions = [] } = useQuery({
    queryKey: ["geofence-excursions", "active"],
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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["geofence-excursions"] })
    queryClient.invalidateQueries({ queryKey: ["attendance-active"] })
    queryClient.invalidateQueries({ queryKey: ["locationAttendanceBatch"] })
  }

  const approve = useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number }) =>
      attendanceApi.approveExcursion(id, minutes),
    onSuccess: () => {
      notify.success(t("attendance.outOfRing.approved", "Approved"))
      invalidate()
    },
    onError: (err: Error) => notify.error(err.message),
  })

  const reject = useMutation({
    mutationFn: (id: string) => attendanceApi.rejectExcursion(id),
    onSuccess: () => {
      notify.success(t("attendance.outOfRing.rejected", "Rejected — worker clocked out"))
      invalidate()
    },
    onError: (err: Error) => notify.error(err.message),
  })

  if (excursions.length === 0) return null

  const pending = excursions.filter((e) => e.status === "PENDING")
  const approved = excursions.filter((e) => e.status === "APPROVED")

  return (
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
        {/* PENDING — needs a decision */}
        {pending.map((ex) => (
          <PendingRow
            key={ex.id}
            ex={ex}
            canApprove={canApprove}
            busy={approve.isPending || reject.isPending}
            onApprove={(minutes) => approve.mutate({ id: ex.id, minutes })}
            onReject={() => reject.mutate(ex.id)}
          />
        ))}

        {/* APPROVED — live countdown */}
        {approved.map((ex) => (
          <ApprovedRow key={ex.id} ex={ex} />
        ))}
      </div>
    </div>
  )
}

function PendingRow({
  ex,
  canApprove,
  busy,
  onApprove,
  onReject,
}: {
  ex: GeofenceExcursion
  canApprove: boolean
  busy: boolean
  onApprove: (minutes: number) => void
  onReject: () => void
}) {
  const { t } = useTranslation()
  const [minutes, setMinutes] = React.useState<number>(ex.requestedMinutes ?? GEOFENCE_EXCURSION.DURATION_PRESETS[0])
  const name = `${ex.user?.firstName ?? ""} ${ex.user?.lastName ?? ""}`.trim() || t("attendance.unknownWorker", "Worker")

  return (
    <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-4 justify-between hover:bg-orange-50/30 dark:hover:bg-orange-500/5">
      <div className="flex items-start gap-3 min-w-0">
        <UserAvatar firstName={ex.user?.firstName} lastName={ex.user?.lastName} seed={ex.userId} size="md" />
        <div className="min-w-0">
          <p className="font-medium text-foreground truncate">{name}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="size-3" />
            {ex.space?.name ?? t("attendance.unknownLocation")}
            {ex.lastDistanceM != null && ` · ${ex.lastDistanceM}m ${t("attendance.outOfRing.away", "away")}`}
          </p>
          {ex.reason && <p className="text-sm text-foreground/80 mt-1 italic">“{ex.reason}”</p>}
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("attendance.outOfRing.requested", "Requested")}: {ex.requestedMinutes ?? "?"} {t("attendance.outOfRing.min", "min")}
          </p>
        </div>
      </div>

      {canApprove ? (
        <div className="flex items-center gap-2 shrink-0">
          <Select value={String(minutes)} onValueChange={(v) => setMinutes(Number(v))}>
            <SelectTrigger className="h-9 w-[110px] rounded-lg">
              <Timer className="size-3.5 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GEOFENCE_EXCURSION.DURATION_PRESETS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m} {t("attendance.outOfRing.min", "min")}
                </SelectItem>
              ))}
              {/* Include the exact requested value if it isn't a preset. */}
              {ex.requestedMinutes != null && !GEOFENCE_EXCURSION.DURATION_PRESETS.includes(ex.requestedMinutes) && (
                <SelectItem value={String(ex.requestedMinutes)}>
                  {ex.requestedMinutes} {t("attendance.outOfRing.min", "min")}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-9 rounded-lg bg-green-600 hover:bg-green-700 text-white"
            disabled={busy}
            onClick={() => onApprove(minutes)}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            <span className="ml-1">{t("common.approve", "Approve")}</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 rounded-lg border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
            disabled={busy}
            onClick={onReject}
          >
            <X className="size-4" />
            <span className="ml-1">{t("common.reject", "Reject")}</span>
          </Button>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground italic shrink-0">
          {t("attendance.outOfRing.awaitingApprover", "Awaiting a manager's decision")}
        </span>
      )}
    </div>
  )
}

function ApprovedRow({ ex }: { ex: GeofenceExcursion }) {
  const { t } = useTranslation()
  const name = `${ex.user?.firstName ?? ""} ${ex.user?.lastName ?? ""}`.trim() || t("attendance.unknownWorker", "Worker")
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

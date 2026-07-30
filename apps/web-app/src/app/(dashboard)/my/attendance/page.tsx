"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useTimeFormat } from "@/hooks"
import { toast } from "sonner"
import { Clock, MapPin, CircleDot, LogIn, LogOut, Loader2, Home } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { attendanceApi } from "@/lib/api"
import { getBrowserPosition, distanceMeters, GeolocationError, type GeolocationFailure } from "@/lib/geolocation"
import { Button } from "@/components/ui/button"
import { hasAccessModule } from "@hbcfield/shared/client"
import type { TimeEntry } from "@hbcfield/shared"
import type { TFunction } from "i18next"

type ClockLocation = { id: string; name: string; lat?: number | null; lng?: number | null }

/** Human-readable duration between two ISO timestamps (or to now). */
function duration(fromIso?: string | null, toIso?: string | null): string {
  if (!fromIso) return "—"
  const from = new Date(fromIso).getTime()
  const to = toIso ? new Date(toIso).getTime() : Date.now()
  const mins = Math.max(0, Math.round((to - from) / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}
function fmtTime(iso?: string | null, hour12 = false): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: hour12 ? "numeric" : "2-digit",
    minute: "2-digit",
    hour12,
  })
}

function geoErrorMessage(t: TFunction, reason: GeolocationFailure): string {
  switch (reason) {
    case "denied":
      return t("attendance.my.geo.denied", "Location permission denied. Allow location access in your browser to clock in.")
    case "insecure":
      return t("attendance.my.geo.insecure", "Clock-in requires a secure (HTTPS) connection.")
    case "unsupported":
      return t("attendance.my.geo.unsupported", "Your browser does not support location services.")
    case "timeout":
      return t("attendance.my.geo.timeout", "Timed out getting your location. Please try again.")
    default:
      return t("attendance.my.geo.unavailable", "Could not determine your location. Please try again.")
  }
}

export default function MyAttendancePage() {
  const { t } = useTranslation()
  const { hour12 } = useTimeFormat()
  const { user } = useAuth()
  const qc = useQueryClient()
  const canSee = !user || hasAccessModule(user, "clock")

  const { data: status } = useQuery({
    queryKey: ["my-attendance-status"],
    queryFn: () => attendanceApi.getMyStatus(),
    enabled: canSee,
    staleTime: 15_000,
  })

  const { data: history, isLoading } = useQuery({
    queryKey: ["my-attendance-history"],
    queryFn: () => attendanceApi.getMyHistory({ limit: 60 }),
    enabled: canSee,
  })

  // Org work locations — needed to resolve which site the user is clocking in at.
  const { data: locationsData } = useQuery({
    queryKey: ["my-attendance-locations"],
    queryFn: () => attendanceApi.getLocations(),
    enabled: canSee,
    staleTime: 5 * 60_000,
  })

  const entries: TimeEntry[] = (history as { data?: TimeEntry[] })?.data ?? []
  const st = (status ?? {}) as Record<string, unknown>
  const activeEntry = (st.currentEntry ?? st.activeEntry ?? st.entry) as TimeEntry | undefined
  const clockedIn = Boolean(st.isClockedIn) || st.status === "CLOCKED_IN" || Boolean(activeEntry && !activeEntry.clockOutAt)
  const locations = (locationsData ?? []) as ClockLocation[]

  // Clock in/out. GPS is read from the browser (device location, VPN-proof); the
  // backend re-checks the geofence and records whether the fix was within it.
  const clock = useMutation({
    mutationFn: async (mode: "out" | "onsite" | "remote") => {
      const pos = await getBrowserPosition()
      if (mode === "out") {
        return attendanceApi.clockOut({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy })
      }
      if (mode === "remote") {
        // No location — geofence-exempt; the backend captures a coarse place.
        return attendanceApi.clockIn({ isRemote: true, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy })
      }
      const geoLocations = locations.filter(
        (l): l is ClockLocation & { lat: number; lng: number } => typeof l.lat === "number" && typeof l.lng === "number",
      )
      if (geoLocations.length === 0) {
        throw new Error(
          t("attendance.my.noLocations", "No work location with GPS is set up. Ask your admin to add one before clocking in."),
        )
      }
      // Clock in at the nearest configured site; the backend enforces the geofence.
      let nearest = geoLocations[0]
      let best = distanceMeters(pos, { lat: nearest.lat, lng: nearest.lng })
      for (const l of geoLocations.slice(1)) {
        const d = distanceMeters(pos, { lat: l.lat, lng: l.lng })
        if (d < best) {
          best = d
          nearest = l
        }
      }
      return attendanceApi.clockIn({ locationId: nearest.id, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy })
    },
    onSuccess: (_data, mode) => {
      qc.invalidateQueries({ queryKey: ["my-attendance-status"] })
      qc.invalidateQueries({ queryKey: ["my-attendance-history"] })
      toast.success(mode === "out" ? t("attendance.my.clockedOutToast", "Clocked out") : t("attendance.my.clockedInToast", "Clocked in"))
    },
    onError: (err: unknown) => {
      if (err instanceof GeolocationError) {
        toast.error(geoErrorMessage(t, err.reason))
      } else {
        toast.error(err instanceof Error ? err.message : t("common.error", "Something went wrong"))
      }
    },
  })

  if (!canSee) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">
        {t("attendance.my.noAccess")}
      </div>
    )
  }

  // Total hours this list (rough sum of completed entries)
  const totalMins = entries.reduce((acc, e) => {
    if (!e.clockInAt) return acc
    const to = e.clockOutAt ? new Date(e.clockOutAt).getTime() : Date.now()
    return acc + Math.max(0, (to - new Date(e.clockInAt).getTime()) / 60000)
  }, 0)
  const totalH = Math.floor(totalMins / 60)
  const totalM = Math.round(totalMins % 60)

  const pending = clock.isPending

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 data-tour="page-my-attendance" className="text-2xl font-semibold text-foreground">{t("attendance.my.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("attendance.my.subtitle")}</p>
      </div>

      {/* Status + summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        <div className="rounded-2xl border border-border bg-card p-5" data-tour="my-attn-clock">
          <div data-tour="my-attn-status">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <CircleDot className={`h-4 w-4 ${clockedIn ? "text-green-600" : "text-slate-400"}`} />
              {t("attendance.my.currentStatus")}
            </div>
            <p className="mt-2 text-lg font-semibold text-foreground">{clockedIn ? t("attendance.my.clockedIn") : t("attendance.my.clockedOut")}</p>
            {clockedIn && activeEntry?.clockInAt && (
              <p className="text-xs text-muted-foreground">{t("attendance.my.since", { time: fmtTime(activeEntry.clockInAt, hour12), duration: duration(activeEntry.clockInAt) })}</p>
            )}
          </div>

          {clockedIn ? (
            <Button onClick={() => clock.mutate("out")} disabled={pending} variant="outline" className="mt-4 w-full">
              {pending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />{t("attendance.my.locating", "Getting your location…")}</>
              ) : (
                <><LogOut className="h-4 w-4" />{t("attendance.my.clockOut", "Clock Out")}</>
              )}
            </Button>
          ) : (
            <div className="mt-4 space-y-2">
              <Button
                onClick={() => clock.mutate("onsite")}
                disabled={pending}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {pending && clock.variables === "onsite" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />{t("attendance.my.locating", "Getting your location…")}</>
                ) : (
                  <><LogIn className="h-4 w-4" />{t("attendance.my.clockIn", "Clock In")}</>
                )}
              </Button>
              {user?.allowRemote && (
                <Button onClick={() => clock.mutate("remote")} disabled={pending} variant="outline" className="w-full">
                  {pending && clock.variables === "remote" ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />{t("attendance.my.locating", "Getting your location…")}</>
                  ) : (
                    <><Home className="h-4 w-4" />{t("attendance.my.clockInRemote", "Clock in remotely")}</>
                  )}
                </Button>
              )}
            </div>
          )}
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {user?.allowRemote
              ? t("attendance.my.gpsHintRemote", "On-site verifies you're at the location. Remote records the city you're working from. Works over VPN.")
              : t("attendance.my.gpsHint", "Uses your device location to verify you're on site. Works over VPN.")}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Clock className="h-4 w-4 text-slate-400" />
            {t("attendance.my.hoursLast", { count: entries.length })}
          </div>
          <p className="mt-2 text-lg font-semibold text-foreground">{totalH}h {totalM}m</p>
        </div>
      </div>

      {/* History */}
      <h2 data-tour="my-attn-history" className="text-sm font-semibold text-foreground mb-3">{t("attendance.my.recentEntries")}</h2>
      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">{t("attendance.my.noRecords")}</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {entries.map((e, i) => (
            <div key={e.id} className={`flex items-center gap-4 px-5 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
              <div className="w-28 shrink-0 text-sm font-medium text-foreground">{fmtDate(e.clockInAt)}</div>
              <div className="flex-1 text-sm text-muted-foreground">
                {fmtTime(e.clockInAt, hour12)} → {e.clockOutAt ? fmtTime(e.clockOutAt, hour12) : <span className="text-green-600">{t("attendance.my.active")}</span>}
                {e.isRemote ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Home className="h-3 w-3" />{t("attendance.my.remote", "Remote")}
                    {e.clockInPlace ? ` · ${e.clockInPlace}` : ""}
                  </span>
                ) : e.location?.name ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />{e.location.name}
                  </span>
                ) : null}
              </div>
              <div className="shrink-0 text-sm font-semibold text-foreground">{duration(e.clockInAt, e.clockOutAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

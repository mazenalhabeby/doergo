"use client"

import { useState, useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { LogIn, LogOut, Home, Loader2, ChevronDown, MapPin } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { attendanceApi } from "@/lib/api"
import { getBrowserPosition, distanceMeters, GeolocationError, type GeolocationFailure } from "@/lib/geolocation"
import { hasAccessModule } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import type { TFunction } from "i18next"
import { mayClockInRemotely } from "@hbcfield/shared/client"

type ClockLocation = { id: string; name: string; lat?: number | null; lng?: number | null }

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
 * Persistent clock-in/out control for the top navbar. Shows only for members
 * with clock access. Clocked out → Clock In (on-site nearest, plus Remote when
 * eligible). Clocked in → a live timer + Clock Out. GPS from the browser
 * (device location, VPN-safe); the backend enforces the geofence.
 */
export function ClockWidget() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const qc = useQueryClient()
  // Clock access is module-driven, not role-locked: anyone whose Access Profile
  // includes the `clock` module can punch in — including an admin/owner who also
  // works on site. It's optional (a button they can ignore), never required, and
  // an admin who shouldn't clock just has `clock` left out of their profile. The
  // backend already allows both ADMIN and EMPLOYEE clock-in.
  const canClock = !!user && hasAccessModule(user, "clock")

  const { data: status } = useQuery({
    queryKey: ["my-attendance-status"],
    queryFn: () => attendanceApi.getMyStatus(),
    enabled: canClock,
    staleTime: 15_000,
    refetchInterval: 60_000,
  })
  const { data: locationsData } = useQuery({
    queryKey: ["my-attendance-locations"],
    queryFn: () => attendanceApi.getLocations(),
    enabled: canClock,
    staleTime: 5 * 60_000,
  })

  const st = (status ?? {}) as Record<string, unknown>
  const activeEntry = (st.currentEntry ?? st.activeEntry ?? st.entry) as { clockInAt?: string; clockOutAt?: string | null; isRemote?: boolean; clockInPlace?: string | null; location?: { name?: string } } | undefined
  const clockedIn = Boolean(st.isClockedIn) || st.status === "CLOCKED_IN" || Boolean(activeEntry && !activeEntry.clockOutAt)
  const elapsed = useElapsed(clockedIn ? activeEntry?.clockInAt ?? null : null)
  const locations = (locationsData ?? []) as ClockLocation[]

  const where = activeEntry?.isRemote
    ? `${t("attendance.my.remote", "Remote")}${activeEntry.clockInPlace ? ` · ${activeEntry.clockInPlace}` : ""}`
    : activeEntry?.location?.name || ""

  const clock = useMutation({
    mutationFn: async (mode: "out" | "onsite" | "remote") => {
      const pos = await getBrowserPosition()
      if (mode === "out") return attendanceApi.clockOut({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy })
      if (mode === "remote") return attendanceApi.clockIn({ isRemote: true, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy })
      const geo = locations.filter(
        (l): l is ClockLocation & { lat: number; lng: number } => typeof l.lat === "number" && typeof l.lng === "number",
      )
      if (geo.length === 0) {
        throw new Error(t("attendance.my.noLocations", "No work location with GPS is set up. Ask your admin to add one before clocking in."))
      }
      let nearest = geo[0]
      let best = distanceMeters(pos, { lat: nearest.lat, lng: nearest.lng })
      for (const l of geo.slice(1)) {
        const d = distanceMeters(pos, { lat: l.lat, lng: l.lng })
        if (d < best) { best = d; nearest = l }
      }
      return attendanceApi.clockIn({ locationId: nearest.id, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy })
    },
    onSuccess: (_data, mode) => {
      qc.invalidateQueries({ queryKey: ["my-attendance-status"] })
      qc.invalidateQueries({ queryKey: ["my-attendance-history"] })
      toast.success(mode === "out" ? t("attendance.my.clockedOutToast", "Clocked out") : t("attendance.my.clockedInToast", "Clocked in"))
    },
    onError: (err: unknown) => {
      if (err instanceof GeolocationError) toast.error(geoErrorMessage(t, err.reason))
      else toast.error(err instanceof Error ? err.message : t("common.error", "Something went wrong"))
    },
  })

  if (!canClock) return null
  const pending = clock.isPending

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
          disabled={pending}
          onClick={() => clock.mutate("out")}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><LogOut className="h-3.5 w-3.5" />{t("attendance.my.clockOut", "Clock Out")}</>}
        </Button>
      </div>
    )
  }

  // ── Clocked out + remote-eligible → Clock In split menu ─────────────
  if (mayClockInRemotely(user)) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="h-8 gap-1 bg-green-600 text-white hover:bg-green-700" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {t("attendance.my.clockIn", "Clock In")}
            <ChevronDown className="h-3.5 w-3.5 opacity-80" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => clock.mutate("onsite")}>
            <MapPin className="h-4 w-4" />
            {t("attendance.my.clockInOnsite", "On-site")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => clock.mutate("remote")}>
            <Home className="h-4 w-4" />
            {t("attendance.my.clockInRemote", "Clock in remotely")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // ── Clocked out (on-site only) → Clock In ───────────────────────────
  return (
    <Button size="sm" className="h-8 gap-1 bg-green-600 text-white hover:bg-green-700" disabled={pending} onClick={() => clock.mutate("onsite")}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
      {t("attendance.my.clockIn", "Clock In")}
    </Button>
  )
}

"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useTimeFormat } from "@/hooks"
import { toast } from "sonner"
import { Clock, MapPin, CircleDot, LogIn, LogOut, Loader2, Home, ListChecks } from "lucide-react"
import { WorkLogTimeline } from "@/components/worklog-timeline"
import { useAuth } from "@/contexts/auth-context"
import { attendanceApi } from "@/lib/api"
import { getBrowserPosition, distanceMeters, GeolocationError, type GeolocationFailure } from "@/lib/geolocation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ProgressRing } from "@/components/progress-ring"
import { hasAccessModule, countryFromTz } from "@hbcfield/shared/client"
import type { TimeEntry } from "@hbcfield/shared"
import type { TFunction } from "i18next"
import { mayClockInRemotely } from "@hbcfield/shared/client"

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

/**
 * The clock that is actually running.
 *
 * A shift in progress is the one thing on this page that changes while somebody
 * looks at it, and a number frozen at the moment the page loaded says the
 * opposite of what a live shift is.
 *
 * Its own component on purpose: a second-by-second tick in the page would
 * re-render the history list, the week strip and every button sixty times a
 * minute. Here it re-renders one span.
 */
function LiveShift({ since, target }: { since: string; target: { start: number; totalMins: number } | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const mins = Math.max(0, (now - new Date(since).getTime()) / 60000)
  const h = Math.floor(mins / 60)
  const m = Math.floor(mins % 60)
  const sec = Math.floor((mins * 60) % 60)

  return (
    <div className="flex items-center gap-4">
      {target && (
        <ProgressRing
          value={Math.min(mins, target.totalMins)}
          total={target.totalMins}
          label={`${Math.round((Math.min(mins, target.totalMins) / target.totalMins) * 100)}%`}
          size={64}
        />
      )}
      <div>
        <div className="text-[28px] font-semibold leading-none tabular-nums text-foreground">
          {h}:{String(m).padStart(2, "0")}
          <span className="text-base text-muted-foreground">:{String(sec).padStart(2, "0")}</span>
        </div>
      </div>
    </div>
  )
}

export default function MyAttendancePage() {
  const { t } = useTranslation()
  const { formatTime, locale } = useTimeFormat()
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

  /*
    The last seven days, as days rather than as a list.

    A column of rows answers "what did I do on the 3rd"; it does not answer "how
    is my week going", which is the question somebody opens their own shifts to
    ask. Both come from the history already fetched — no extra request, one pass.
  */
  const week = (() => {
    const days: { key: string; date: Date; minutes: number }[] = []
    const today = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      d.setHours(0, 0, 0, 0)
      days.push({ key: d.toISOString().slice(0, 10), date: d, minutes: 0 })
    }
    const byKey = new Map(days.map((d) => [d.key, d]))
    for (const e of entries) {
      if (!e.clockInAt) continue
      const day = byKey.get(new Date(e.clockInAt).toISOString().slice(0, 10))
      if (!day) continue
      const to = e.clockOutAt ? new Date(e.clockOutAt).getTime() : Date.now()
      day.minutes += Math.max(0, (to - new Date(e.clockInAt).getTime()) / 60000)
    }
    const total = days.reduce((a, d) => a + d.minutes, 0)
    const peak = Math.max(60, ...days.map((d) => d.minutes))
    return { days, total, peak }
  })()

  const hm = (mins: number) => {
    const h = Math.floor(mins / 60)
    const m = Math.round(mins % 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

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

  const pending = clock.isPending

  return (
    <div className="max-w-3xl">
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
            {clockedIn && activeEntry?.clockInAt ? (
              <>
                <div className="mt-3">
                  <LiveShift since={activeEntry.clockInAt} target={shiftTarget} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("attendance.my.sinceAt", "Since {{time}}", {
                    time: formatTime(activeEntry.clockInAt, activeEntry.timezone ?? activeEntry.location?.timezone),
                  })}
                  {activeEntry.isRemote
                    ? ` · ${t("attendance.my.remote", "Remote")}${activeEntry.clockInPlace ? ` · ${activeEntry.clockInPlace}` : ""}`
                    : activeEntry.location?.name
                      ? ` · ${activeEntry.location.name}`
                      : ""}
                </p>
              </>
            ) : (
              <p className="mt-2 text-lg font-semibold text-foreground">{t("attendance.my.clockedOut")}</p>
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
              {mayClockInRemotely(user) && (
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
            {mayClockInRemotely(user)
              ? t("attendance.my.gpsHintRemote", "On-site verifies you're at the location. Remote records the city you're working from. Works over VPN.")
              : t("attendance.my.gpsHint", "Uses your device location to verify you're on site. Works over VPN.")}
          </p>
        </div>
        {/*
          The week, as seven bars.

          "Hours in the last 60 entries" was a true number that answered no
          question anybody has. This says how the week is going and which day was
          heavy, at a glance, from the same data.
        */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Clock className="h-4 w-4 text-slate-400" />
            {t("attendance.my.thisWeek", "Last 7 days")}
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{hm(week.total)}</p>

          <div className="mt-4 flex items-end justify-between gap-1.5" aria-hidden>
            {week.days.map((d) => {
              const pct = d.minutes / week.peak
              const isToday = d.key === new Date().toISOString().slice(0, 10)
              return (
                <div key={d.key} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-16 w-full items-end">
                    <div
                      className={cn(
                        "w-full rounded-md transition-[height] duration-700 ease-out",
                        d.minutes === 0 ? "bg-muted" : isToday ? "bg-primary" : "bg-primary/35",
                      )}
                      style={{ height: `${Math.max(d.minutes === 0 ? 4 : 10, pct * 100)}%` }}
                      title={hm(d.minutes)}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-[10px] leading-none",
                      isToday ? "font-semibold text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {d.date.toLocaleDateString(locale, { weekday: "narrow" })}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Active-session work log — jot down what you do; becomes the clock-out summary. */}
      {clockedIn && activeEntry?.id && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-5">
          <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <ListChecks className="h-4 w-4 text-primary" /> {t("worklog.myTitle", "What I'm doing today")}
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{t("worklog.myHint", "Note what you finish through the shift (add a photo if useful) — it becomes your clock-out summary.")}</p>
          <WorkLogTimeline entryId={activeEntry.id} editable />
        </div>
      )}

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
                {formatTime(e.clockInAt, (e.timezone ?? e.location?.timezone))} → {e.clockOutAt ? formatTime(e.clockOutAt, (e.timezone ?? e.location?.timezone)) : <span className="text-green-600">{t("attendance.my.active")}</span>}
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
              {/*
                Why a shift is worth a second look — late, overtime, no
                clock-out. The member already sees these on their manager's
                screen; hiding them here meant the first they knew of a query
                was somebody asking about it.
              */}
              {!!e.flagReasons?.length && (
                <div className="hidden shrink-0 gap-1 sm:flex">
                  {e.flagReasons.slice(0, 2).map((f) => (
                    <span
                      key={f}
                      className="rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
                    >
                      {t(`attendanceReview.flags.${f}`, f.replace(/_/g, " ").toLowerCase())}
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

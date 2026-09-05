"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useTimeFormat } from "@/hooks"
import { toast } from "sonner"
import { Clock, MapPin, CircleDot, LogIn, LogOut, Loader2, Home, ListChecks, Calendar as CalendarIcon } from "lucide-react"
import { WorkLogTimeline } from "@/components/worklog-timeline"
import { useAuth } from "@/contexts/auth-context"
import { attendanceApi } from "@/lib/api"
import { getBrowserPosition, GeolocationError, type GeolocationFailure } from "@/lib/geolocation"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { ProgressRing } from "@/components/progress-ring"
import { hasAccessModule, countryFromTz } from "@hbcfield/shared/client"
import type { TimeEntry } from "@hbcfield/shared"
import type { DateRange } from "react-day-picker"
import type { TFunction } from "i18next"
import { mayClockInRemotely } from "@hbcfield/shared/client"

import { ClockInPicker, type ClockLocation } from "./_components/clock-in-picker"

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

/**
 * The window, chosen once.
 *
 * Two separate pickers asked the same person the same question twice and let
 * them answer it inconsistently — a "to" before its "from" is a state the form
 * has to catch and explain, and the second popover made picking a fortnight
 * four clicks and two menus.
 *
 * `mode="range"` is one gesture: click the first day, click the last, done. The
 * calendar cannot express a backwards range, so the validation it replaces has
 * nothing left to catch. Same composition the member's time-off dialog already
 * uses — Button, Popover, the shared Calendar.
 *
 * Values stay "yyyy-MM-dd" strings, because that is what the API takes; the
 * Date objects exist only while the calendar is open.
 */
function RangeField({
  from,
  to,
  onChange,
  placeholder,
}: {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  placeholder: string
}) {
  const { locale } = useTimeFormat()
  const selected: DateRange | undefined = from
    ? { from: new Date(`${from}T00:00:00`), to: to ? new Date(`${to}T00:00:00`) : undefined }
    : undefined

  const show = (d: Date) => d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-9 justify-start rounded-lg text-left text-sm font-normal", !from && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 size-3.5 text-muted-foreground" />
          {selected?.from
            ? selected.to
              ? `${show(selected.from)} — ${show(selected.to)}`
              : show(selected.from)
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarPicker
          mode="range"
          selected={selected}
          onSelect={(r) => onChange(r?.from ? toISODate(r.from) : "", r?.to ? toISODate(r.to) : "")}
          // Two months, because a range that crosses one is the common case —
          // "the last fortnight" should not need a click into the previous page.
          numberOfMonths={2}
          // Nothing that has not happened: this is a record, not a plan.
          disabled={{ after: new Date() }}
          defaultMonth={selected?.from}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}

/** Local calendar day as yyyy-MM-dd — never via toISOString, which shifts to UTC. */
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
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

  /*
    Which stretch of time the page is about.

    It used to be "the last 60 entries", which is not a period anybody thinks
    in: a part-timer's 60 entries reach back six months and a full-timer's three
    weeks, so the same screen meant something different to each of them and
    neither could ask "how did last month go".

    The window drives the totals, the bars AND the list, so there is one answer
    on the page rather than three that happen to be near each other.
  */
  const [period, setPeriod] = useState<"7" | "30" | "custom">("7")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  const range = (() => {
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    if (period === "custom") {
      // Half a range is not a question yet — until both ends are set the page
      // keeps showing the last week rather than an empty screen.
      if (!customFrom || !customTo) return null
      return customFrom <= customTo
        ? { startDate: customFrom, endDate: customTo }
        : { startDate: customTo, endDate: customFrom }
    }
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - (period === "7" ? 6 : 29))
    return { startDate: iso(from), endDate: iso(to) }
  })()

  const effectiveRange = range ?? (() => {
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - 6)
    return { startDate: iso(from), endDate: iso(to) }
  })()

  const { data: history, isLoading } = useQuery({
    // The range is IN the key: a different window is a different question, and
    // the answer to the old one must not be shown while this one loads.
    queryKey: ["my-attendance-history", effectiveRange.startDate, effectiveRange.endDate],
    queryFn: () => attendanceApi.getMyHistory({ ...effectiveRange, limit: 200 }),
    enabled: canSee,
    // A finished period does not change; only one that includes today does.
    staleTime: 30_000,
  })

  /*
    Where this member may clock in — assignments, not visibility.

    This read `GET /locations`, which answers "what can I see". A manager sees
    the whole directory, so the nearest workspace could be one they are not
    assigned to, and the clock-in came back "You are not assigned to this
    location" with nothing they could do about it.
  */
  const { data: locationsData } = useQuery({
    queryKey: ["my-clock-in-locations"],
    queryFn: () => attendanceApi.getClockInLocations(),
    enabled: canSee,
    staleTime: 5 * 60_000,
  })

  const entries: TimeEntry[] = (history as { data?: TimeEntry[] })?.data ?? []
  const st = (status ?? {}) as Record<string, unknown>
  const activeEntry = (st.currentEntry ?? st.activeEntry ?? st.entry) as TimeEntry | undefined
  const clockedIn = Boolean(st.isClockedIn) || st.status === "CLOCKED_IN" || Boolean(activeEntry && !activeEntry.clockOutAt)
  const locations = (locationsData ?? []) as ClockLocation[]
  const [pickerOpen, setPickerOpen] = useState(false)

  /*
    One workspace is not a choice.

    Asking somebody with a single site to confirm it every morning is a tap they
    have to make and can never get wrong — the definition of a dialog that
    should not exist. The picker appears only when there is something to decide.
  */
  const startOnSite = () => {
    if (locations.length === 1) {
      clock.mutate({ locationId: locations[0].id })
      return
    }
    setPickerOpen(true)
  }

  // Clock in/out. GPS is read from the browser (device location, VPN-proof); the
  // backend re-checks the geofence and records whether the fix was within it.
  const clock = useMutation({
    mutationFn: async (arg: "out" | "remote" | { locationId: string }) => {
      const pos = await getBrowserPosition()
      if (arg === "out") {
        return attendanceApi.clockOut({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy })
      }
      if (arg === "remote") {
        // No location — geofence-exempt; the backend captures a coarse place.
        return attendanceApi.clockIn({ isRemote: true, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy })
      }
      /*
        An explicit workspace, always.

        This used to choose the NEAREST site itself and say nothing about it. A
        member working across two places was silently clocked in at whichever
        one the GPS liked better — a payroll error that surfaces weeks later on
        a queried timesheet, if at all. The workspace is now either the only one
        they have or the one they picked.
      */
      return attendanceApi.clockIn({ locationId: arg.locationId, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy })
    },
    onSuccess: (_data, mode) => {
      qc.invalidateQueries({ queryKey: ["my-attendance-status"] })
      qc.invalidateQueries({ queryKey: ["my-attendance-history"] })
      setPickerOpen(false)
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
    The chosen window, as days rather than as a list.

    A column of rows answers "what did I do on the 3rd"; it does not answer "how
    did the month go", which is the question somebody opens their own shifts to
    ask. Both come from the one request — no second call for the totals.

    Bars stay readable at any length: a fortnight is drawn day by day, a quarter
    week by week. Thirty hairlines would be a texture, not information.
  */
  const window_ = (() => {
    const day = 86_400_000
    const from = new Date(`${effectiveRange.startDate}T00:00:00`)
    const to = new Date(`${effectiveRange.endDate}T00:00:00`)
    const dayCount = Math.max(1, Math.round((to.getTime() - from.getTime()) / day) + 1)
    const groupWeekly = dayCount > 16

    const buckets: { key: string; start: Date; minutes: number; label: string }[] = []
    for (let i = 0; i < dayCount; i += groupWeekly ? 7 : 1) {
      const d = new Date(from.getTime() + i * day)
      buckets.push({
        key: d.toISOString().slice(0, 10),
        start: d,
        minutes: 0,
        label: groupWeekly
          ? d.toLocaleDateString(locale, { day: "numeric", month: "short" })
          : d.toLocaleDateString(locale, { weekday: "narrow" }),
      })
    }

    let worked = 0
    let daysWorked = 0
    const seenDays = new Set<string>()
    for (const e of entries) {
      if (!e.clockInAt) continue
      const at = new Date(e.clockInAt)
      const offset = Math.floor((at.getTime() - from.getTime()) / day)
      if (offset < 0 || offset >= dayCount) continue
      const idx = groupWeekly ? Math.floor(offset / 7) : offset
      const to_ = e.clockOutAt ? new Date(e.clockOutAt).getTime() : Date.now()
      const mins = Math.max(0, (to_ - at.getTime()) / 60000)
      const bucket = buckets[idx]
      if (bucket) bucket.minutes += mins
      worked += mins
      const dayKey = at.toISOString().slice(0, 10)
      if (!seenDays.has(dayKey)) {
        seenDays.add(dayKey)
        daysWorked++
      }
    }

    const peak = Math.max(60, ...buckets.map((b) => b.minutes))
    return { buckets, peak, worked, daysWorked, dayCount, groupWeekly, todayKey: new Date().toISOString().slice(0, 10) }
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
        <h1 data-tour="page-my-attendance" className="text-2xl font-semibold text-foreground">{t("nav.myShifts", "My shifts")}</h1>
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
                onClick={startOnSite}
                disabled={pending || locations.length === 0}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {pending && typeof clock.variables === "object" ? (
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
          <ClockInPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            locations={locations}
            pending={pending}
            geoErrorMessage={(reason) => geoErrorMessage(t, reason)}
            onPick={(locationId) => clock.mutate({ locationId })}
          />
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {mayClockInRemotely(user)
              ? t("attendance.my.gpsHintRemote", "On-site verifies you're at the location. Remote records the city you're working from. Works over VPN.")
              : t("attendance.my.gpsHint", "Uses your device location to verify you're on site. Works over VPN.")}
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
            <p className="text-2xl font-semibold tabular-nums text-foreground">{hm(window_.worked)}</p>
            {window_.daysWorked > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("attendance.my.overDays", "{{days}} days · {{avg}} avg", {
                  days: window_.daysWorked,
                  avg: hm(window_.worked / window_.daysWorked),
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
                      title={`${b.label} · ${hm(b.minutes)}`}
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

      {/* History, and the window it belongs to */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 data-tour="my-attn-history" className="text-sm font-semibold text-foreground">
          {t("attendance.my.recentEntries")}
          <span className="ml-2 font-normal text-muted-foreground tabular-nums">{entries.length}</span>
        </h2>

        {/* The house segmented control, as used by the customers list. */}
        <div className="inline-flex rounded-lg bg-muted p-0.5">
          {(["7", "30", "custom"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p === "7"
                ? t("attendance.my.period7", "7 days")
                : p === "30"
                  ? t("attendance.my.period30", "30 days")
                  : t("attendance.my.periodCustom", "Custom")}
            </button>
          ))}
        </div>
      </div>

      {/*
        Two dates, and only when they are asked for.

        Revealed by the Custom tab rather than sitting there permanently: most
        visits are "how was my week", and a pair of empty date fields above every
        one of them is furniture nobody needed.
      */}
      {period === "custom" && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <RangeField
            from={customFrom}
            to={customTo}
            onChange={(f, t2) => {
              setCustomFrom(f)
              setCustomTo(t2)
            }}
            placeholder={t("attendance.my.pickRange", "Pick a date range")}
          />
          {!range && (
            <p className="text-xs text-muted-foreground">
              {t("attendance.my.pickBoth", "Pick both dates — showing the last 7 days until then.")}
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          {/* Which window is empty — "no records" alone reads as "you have never
              worked here", when it usually means "not in these dates". */}
          {t("attendance.my.noneInRange", "No shifts between {{from}} and {{to}}.", {
            from: new Date(`${effectiveRange.startDate}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" }),
            to: new Date(`${effectiveRange.endDate}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" }),
          })}
        </div>
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

"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  CalendarDays, ChevronLeft, ChevronRight, Check, X, Plane, Stethoscope,
  User2, MoreHorizontal, Loader2, AlertTriangle, Clock3, CalendarCheck,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { employeesApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { hasAccessModule } from "@hbcfield/shared/client"
import type { TimeOffRequest } from "@hbcfield/shared"

/*
  Leave-management products all lead with the same three things: how much
  allowance is left, who else is away, and where a request has got to.

  Two of those cannot be built honestly here. TimeOff has no allowance or
  entitlement column, so "12 days remaining" would be a number this system
  invented; and a member has no permission to read colleagues' absence, so a
  team calendar would be empty or forbidden depending on who looked.

  What IS real is the person's own history, and it answers the question the
  balance widget is standing in for — "what have I already got booked?" So the
  calendar renders their existing requests in place, the summary counts real
  days, and picking days that collide with something already booked says so
  before it is submitted rather than after it is rejected.
*/

const REASON_TYPES = [
  { key: "vacation", icon: Plane },
  { key: "sickLeave", icon: Stethoscope },
  { key: "personal", icon: User2 },
  { key: "other", icon: MoreHorizontal },
] as const
type ReasonKey = (typeof REASON_TYPES)[number]["key"]

const STATUS_STYLES: Record<string, string> = {
  PENDING: "text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-500/15",
  APPROVED: "text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-500/15",
  REJECTED: "text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-500/15",
  CANCELED: "text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-500/15",
}

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const sameDay = (a: Date, b: Date) => toISO(a) === toISO(b)
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000)

function fmt(iso?: string): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function monthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7 // Monday = 0
  const cells: (Date | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (Date | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** ISO day → the request occupying it. Cheap lookup while rendering the grid. */
function bookedDays(list: TimeOffRequest[]): Map<string, TimeOffRequest> {
  const map = new Map<string, TimeOffRequest>()
  for (const r of list) {
    if (r.status === "REJECTED" || r.status === "CANCELED") continue
    const end = startOfDay(new Date(r.endDate))
    for (let d = startOfDay(new Date(r.startDate)); d <= end; d = addDays(d, 1)) {
      map.set(toISO(d), r)
    }
  }
  return map
}

export default function MyTimeOffPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const qc = useQueryClient()
  const canSee = !user || hasAccessModule(user, "time_off")

  const STATUS_LABELS: Record<string, string> = {
    PENDING: t("common.pending"),
    APPROVED: t("common.approved"),
    REJECTED: t("common.rejected"),
    CANCELED: t("common.canceled"),
  }

  const [reasonType, setReasonType] = useState<ReasonKey | null>(null)
  const [notes, setNotes] = useState("")
  const [rangeStart, setRangeStart] = useState<Date | null>(null)
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null)
  const [hovered, setHovered] = useState<Date | null>(null)
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))

  const today = startOfDay(new Date())
  const weeks = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor])

  const { data: requests, isLoading } = useQuery({
    queryKey: ["my-time-off", user?.id],
    queryFn: () => employeesApi.getTimeOff(user!.id),
    enabled: canSee && !!user?.id,
  })
  const refetch = () => qc.invalidateQueries({ queryKey: ["my-time-off", user?.id] })

  const list: TimeOffRequest[] = (requests as TimeOffRequest[]) ?? []
  const booked = useMemo(() => bookedDays(list), [list])

  // Real figures only — every one is derived from the person's own requests.
  const stats = useMemo(() => {
    const year = today.getFullYear()
    let daysThisYear = 0
    let pending = 0
    let next: TimeOffRequest | null = null
    for (const r of list) {
      if (r.status === "PENDING") pending++
      if (r.status === "REJECTED" || r.status === "CANCELED") continue
      const s = startOfDay(new Date(r.startDate))
      const e = startOfDay(new Date(r.endDate))
      if (s.getFullYear() === year) daysThisYear += dayDiff(s, e) + 1
      if (s >= today && (!next || s < startOfDay(new Date(next.startDate)))) next = r
    }
    return { daysThisYear, pending, next }
  }, [list, today])

  const reset = () => {
    setReasonType(null); setNotes(""); setRangeStart(null); setRangeEnd(null); setHovered(null)
  }

  const createMut = useMutation({
    mutationFn: () => {
      // Composed exactly as mobile composes it, from the same four keys.
      const label = t(`timeOff.reasonTypes.${reasonType}`)
      const reason = notes.trim() ? `${label}: ${notes.trim()}` : label
      return employeesApi.requestTimeOff(user!.id, {
        startDate: toISO(rangeStart!),
        endDate: toISO(rangeEnd ?? rangeStart!),
        reason,
      })
    },
    onSuccess: () => {
      notify.success(t("timeOff.my.requestedTitle"), t("timeOff.my.requestedDesc"))
      reset(); refetch()
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("timeOff.my.submitError")),
  })

  const cancelMut = useMutation({
    mutationFn: (id: string) => employeesApi.cancelTimeOff(id),
    onSuccess: () => { notify.success(t("timeOff.my.canceledToast")); refetch() },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("timeOff.my.cancelError")),
  })

  if (!canSee) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">
        {t("timeOff.my.noAccess")}
      </div>
    )
  }

  // One click books a day; a second extends it either way. Single-day is the
  // common case, so it is the default rather than a mode to pick first.
  const pickDay = (d: Date) => {
    if (d < today) return
    if (!rangeStart || (rangeStart && rangeEnd)) { setRangeStart(d); setRangeEnd(null); return }
    if (sameDay(d, rangeStart)) { setRangeEnd(d); return }
    if (d < rangeStart) { setRangeEnd(rangeStart); setRangeStart(d) } else { setRangeEnd(d) }
  }

  const effectiveEnd = rangeEnd ?? (rangeStart && hovered && hovered > rangeStart ? hovered : null)
  const inRange = (d: Date) => !!rangeStart && !!effectiveEnd && d > rangeStart && d < effectiveEnd
  const isEdge = (d: Date) =>
    (!!rangeStart && sameDay(d, rangeStart)) || (!!effectiveEnd && sameDay(d, effectiveEnd))

  const selectedEnd = rangeEnd ?? rangeStart
  const dayCount = rangeStart && selectedEnd ? dayDiff(rangeStart, selectedEnd) + 1 : 0

  // Caught before submitting rather than after a manager rejects it.
  const clash = useMemo(() => {
    if (!rangeStart || !selectedEnd) return null
    for (let d = rangeStart; d <= selectedEnd; d = addDays(d, 1)) {
      const hit = booked.get(toISO(d))
      if (hit) return hit
    }
    return null
  }, [rangeStart, selectedEnd, booked])

  const canSubmit = !!reasonType && !!rangeStart && !clash && !createMut.isPending
  const weekdays = t("timeOff.my.weekdays", { defaultValue: "Mo,Tu,We,Th,Fr,Sa,Su" }).split(",")
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("nav.timeOff")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("timeOff.my.subtitle")}</p>
      </header>

      {/* Real counts only. There is no allowance in the data, so there is no
          "days remaining" here — it would be a number nothing backs. */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat icon={CalendarCheck} value={String(stats.daysThisYear)} label={t("timeOff.my.statBooked")} />
        <Stat icon={Clock3} value={String(stats.pending)} label={t("timeOff.my.statPending")}
              tone={stats.pending > 0 ? "amber" : undefined} />
        <Stat icon={CalendarDays}
              value={stats.next ? fmt(stats.next.startDate) : "—"}
              label={t("timeOff.my.statNext")} small />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Calendar ─────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <button type="button" aria-label={t("timeOff.my.prevMonth")}
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-medium capitalize text-foreground">{monthLabel}</span>
            <button type="button" aria-label={t("timeOff.my.nextMonth")}
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-y-1 text-center">
            {weekdays.map((w) => (
              <span key={w} className="pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{w}</span>
            ))}
            {weeks.flat().map((d, i) => {
              if (!d) return <span key={`x${i}`} />
              const iso = toISO(d)
              const past = d < today
              const edge = isEdge(d)
              const mid = inRange(d)
              const book = booked.get(iso)
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={past}
                  onClick={() => pickDay(d)}
                  onMouseEnter={() => setHovered(d)}
                  onMouseLeave={() => setHovered(null)}
                  title={book?.reason ?? undefined}
                  className={cn(
                    "relative mx-auto flex size-10 flex-col items-center justify-center text-sm transition-all duration-150",
                    past && "cursor-not-allowed text-muted-foreground/35",
                    !past && !edge && !mid && "rounded-lg text-foreground hover:bg-accent",
                    mid && "bg-primary/15 text-foreground",
                    edge && "rounded-lg bg-primary font-semibold text-primary-foreground shadow-sm motion-safe:scale-105",
                    !past && sameDay(d, today) && !edge && !mid && "font-semibold text-primary",
                  )}
                >
                  {d.getDate()}
                  {/* Already booked — the answer to "what have I got?" shown
                      where the question is asked, not on a list further down. */}
                  {book && !edge && (
                    <span className={cn(
                      "absolute bottom-1 h-1 w-1 rounded-full",
                      book.status === "APPROVED" ? "bg-green-500" : "bg-amber-500",
                    )} />
                  )}
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
            <Legend className="bg-green-500" label={t("timeOff.my.legendApproved")} />
            <Legend className="bg-amber-500" label={t("timeOff.my.legendPending")} />
            <Legend className="bg-primary" label={t("timeOff.my.legendSelected")} />
          </div>
        </section>

        {/* ── Request ──────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("timeOff.my.stepReason")}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {REASON_TYPES.map(({ key, icon: Icon }) => {
              const active = reasonType === key
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setReasonType(active ? null : key)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 transition-all duration-200",
                    "motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-4 transition-transform duration-200", active && "scale-110")} />
                  <span className="text-[11px] font-medium">{t(`timeOff.reasonTypes.${key}`)}</span>
                </button>
              )
            })}
          </div>

          {/* Offered for every type: someone on vacation still wants to say
              "back Monday". Under "Other" it is the only identifying detail. */}
          <div className={cn("grid transition-all duration-300 ease-out",
            reasonType ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
            <div className="overflow-hidden">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={200}
                placeholder={reasonType === "other"
                  ? t("timeOff.my.notesRequiredPlaceholder")
                  : t("timeOff.my.notesPlaceholder")}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
          </div>

          <div className={cn("grid transition-all duration-300 ease-out",
            rangeStart ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
            <div className="overflow-hidden space-y-2">
              <div className="rounded-xl bg-muted/50 px-3 py-2.5">
                <p className="text-sm text-foreground">
                  {rangeStart && fmt(toISO(rangeStart))}
                  {rangeEnd && !sameDay(rangeEnd, rangeStart!) && <> → {fmt(toISO(rangeEnd))}</>}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("timeOff.my.dayCount", { count: dayCount })}
                </p>
              </div>
              {clash && (
                <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{t("timeOff.my.overlapWarning", {
                    from: fmt(clash.startDate), to: fmt(clash.endDate),
                  })}</span>
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button onClick={() => createMut.mutate()} disabled={!canSubmit} className="flex-1">
              {createMut.isPending
                ? <Loader2 className="mr-2 size-4 animate-spin" />
                : <Check className="mr-2 size-4" />}
              {t("timeOff.my.requestButton")}
            </Button>
            {(reasonType || rangeStart) && (
              <Button variant="ghost" size="sm" onClick={reset} disabled={createMut.isPending}>
                {t("common.clear", { defaultValue: "Clear" })}
              </Button>
            )}
          </div>
          {!rangeStart && (
            <p className="mt-2 text-center text-xs text-muted-foreground">{t("timeOff.my.pickDaysHint")}</p>
          )}
        </section>
      </div>

      {/* ── History ──────────────────────────────────────────────────── */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t("timeOff.my.myRequests")}</h2>
        {isLoading ? (
          <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
        ) : list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {t("timeOff.my.noRequests")}
          </p>
        ) : (
          <ul className="space-y-2">
            {list.map((r) => (
              <li key={r.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/30">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {fmt(r.startDate)}{r.endDate !== r.startDate && <> → {fmt(r.endDate)}</>}
                  </p>
                  {r.reason && <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.reason}</p>}
                  {r.status === "REJECTED" && r.rejectionReason && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {t("timeOff.my.rejectedReason")}: {r.rejectionReason}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLES[r.status])}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                  {r.status === "PENDING" && (
                    <button type="button" aria-label={t("common.cancel")}
                      onClick={() => cancelMut.mutate(r.id)} disabled={cancelMut.isPending}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({ icon: Icon, value, label, tone, small }: {
  icon: typeof CalendarDays; value: string; label: string; tone?: "amber"; small?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-3 sm:px-4">
      <Icon className={cn("size-4", tone === "amber" ? "text-amber-500" : "text-muted-foreground")} />
      <p className={cn("mt-2 font-semibold tabular-nums text-foreground", small ? "text-sm" : "text-2xl")}>{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
    </span>
  )
}

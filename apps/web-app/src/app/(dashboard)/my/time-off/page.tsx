"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarDays, ChevronLeft, ChevronRight, Check, X, Plane, Stethoscope, User2, MoreHorizontal, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { employeesApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { hasAccessModule } from "@hbcfield/shared/client"
import type { TimeOffRequest } from "@hbcfield/shared"

/*
  The reason is chosen BEFORE the dates, deliberately.

  The old page opened with two date inputs and a free-text box, so every request
  arrived with a differently-worded reason — "hol", "Urlaub", "sick" — and
  nothing could ever be grouped or counted. Mobile already solved this with a
  fixed set plus a free-text note; these are the SAME four keys, and the reason
  string is composed the same way ("Vacation: back Monday"), so a request reads
  identically whichever device filed it.
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

function fmt(iso?: string): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

/** Weeks of the given month, padded with nulls so each row is 7 cells (Mon-first). */
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

  const reset = () => {
    setReasonType(null); setNotes(""); setRangeStart(null); setRangeEnd(null); setHovered(null)
  }

  const createMut = useMutation({
    mutationFn: () => {
      // Same composition as mobile, so one request reads the same on both.
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

  const list: TimeOffRequest[] = (requests as TimeOffRequest[]) ?? []

  /*
    One tap picks a single day; a second tap extends it into a range, in either
    direction. There is no separate "single day" mode to choose first — the most
    common request is one day, and making that the default costs the range case
    nothing.
  */
  const pickDay = (d: Date) => {
    if (d < today) return
    if (!rangeStart || (rangeStart && rangeEnd)) { setRangeStart(d); setRangeEnd(null); return }
    if (sameDay(d, rangeStart)) { setRangeEnd(d); return }
    if (d < rangeStart) { setRangeEnd(rangeStart); setRangeStart(d) } else { setRangeEnd(d) }
  }

  // While picking the second day, the hovered day previews the range.
  const effectiveEnd = rangeEnd ?? (rangeStart && hovered && hovered > rangeStart ? hovered : null)
  const inRange = (d: Date) =>
    !!rangeStart && !!effectiveEnd && d > rangeStart && d < effectiveEnd
  const isEdge = (d: Date) =>
    (!!rangeStart && sameDay(d, rangeStart)) || (!!effectiveEnd && sameDay(d, effectiveEnd))

  const dayCount =
    rangeStart ? Math.round(((rangeEnd ?? rangeStart).getTime() - rangeStart.getTime()) / 86400000) + 1 : 0
  const canSubmit = !!reasonType && !!rangeStart && !createMut.isPending

  const weekdays = t("timeOff.my.weekdays", { defaultValue: "Mo,Tu,We,Th,Fr,Sa,Su" }).split(",")
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("nav.timeOff")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("timeOff.my.subtitle")}</p>
      </header>

      {/* ── Step 1: why ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <StepHeading n={1} title={t("timeOff.my.stepReason")} done={!!reasonType} />
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {REASON_TYPES.map(({ key, icon: Icon }) => {
            const active = reasonType === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setReasonType(active ? null : key)}
                aria-pressed={active}
                className={cn(
                  "group flex flex-col items-center gap-2 rounded-xl border px-3 py-4 transition-all duration-200",
                  "motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary bg-primary/10 text-primary shadow-sm"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                <Icon className={cn("size-5 transition-transform duration-200", active && "scale-110")} />
                <span className="text-xs font-medium">{t(`timeOff.reasonTypes.${key}`)}</span>
              </button>
            )
          })}
        </div>

        {/* Free text is always available, not only under "Other": someone taking
            vacation still wants to say "back Monday". Under "Other" it is the
            only thing identifying the request, so it is asked for more firmly. */}
        <div
          className={cn(
            "grid transition-all duration-300 ease-out",
            reasonType ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={200}
              placeholder={
                reasonType === "other"
                  ? t("timeOff.my.notesRequiredPlaceholder")
                  : t("timeOff.my.notesPlaceholder")
              }
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
        </div>
      </section>

      {/* ── Step 2: when ────────────────────────────────────────────── */}
      <section
        className={cn(
          "mt-3 rounded-2xl border border-border bg-card p-4 transition-all duration-300 sm:p-5",
          !reasonType && "pointer-events-none opacity-45",
        )}
        aria-disabled={!reasonType}
      >
        <StepHeading n={2} title={t("timeOff.my.stepDates")} done={!!rangeStart} />

        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t("timeOff.my.prevMonth")}
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-medium capitalize text-foreground">{monthLabel}</span>
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={t("timeOff.my.nextMonth")}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-y-1 text-center">
          {weekdays.map((w) => (
            <span key={w} className="pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{w}</span>
          ))}
          {weeks.flat().map((d, i) => {
            if (!d) return <span key={`x${i}`} />
            const past = d < today
            const edge = isEdge(d)
            const mid = inRange(d)
            return (
              <button
                key={toISO(d)}
                type="button"
                disabled={past}
                onClick={() => pickDay(d)}
                onMouseEnter={() => setHovered(d)}
                onMouseLeave={() => setHovered(null)}
                className={cn(
                  "relative mx-auto flex size-9 items-center justify-center text-sm transition-all duration-150",
                  past && "cursor-not-allowed text-muted-foreground/35",
                  !past && !edge && !mid && "rounded-lg text-foreground hover:bg-accent",
                  mid && "bg-primary/15 text-foreground first:rounded-l-lg last:rounded-r-lg",
                  edge && "rounded-lg bg-primary font-semibold text-primary-foreground motion-safe:scale-105 shadow-sm",
                  !past && sameDay(d, today) && !edge && !mid && "font-semibold text-primary",
                )}
              >
                {d.getDate()}
              </button>
            )
          })}
        </div>

        <div
          className={cn(
            "grid transition-all duration-300 ease-out",
            rangeStart ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 px-3.5 py-2.5">
              <span className="text-sm text-foreground">
                {rangeStart && fmt(toISO(rangeStart))}
                {rangeEnd && !sameDay(rangeEnd, rangeStart!) && <> → {fmt(toISO(rangeEnd))}</>}
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {t("timeOff.my.dayCount", { count: dayCount })}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button onClick={() => createMut.mutate()} disabled={!canSubmit} className="flex-1 sm:flex-none">
            {createMut.isPending
              ? <Loader2 className="mr-2 size-4 animate-spin" />
              : <CalendarDays className="mr-2 size-4" />}
            {t("timeOff.my.requestButton")}
          </Button>
          {(reasonType || rangeStart) && (
            <Button variant="ghost" onClick={reset} disabled={createMut.isPending}>
              {t("common.clear", { defaultValue: "Clear" })}
            </Button>
          )}
        </div>
      </section>

      {/* ── My requests ─────────────────────────────────────────────── */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t("timeOff.my.myRequests")}</h2>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {t("timeOff.my.noRequests")}
          </p>
        ) : (
          <ul className="space-y-2">
            {list.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/30"
              >
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
                    <button
                      type="button"
                      onClick={() => cancelMut.mutate(r.id)}
                      disabled={cancelMut.isPending}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={t("common.cancel")}
                    >
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

function StepHeading({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300",
          done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {done ? <Check className="size-3.5" /> : n}
      </span>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
    </div>
  )
}

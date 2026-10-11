"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  CalendarDays, ChevronLeft, ChevronRight, Check, X,
  Loader2, AlertTriangle, Clock3,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { calendarApi, employeesApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { ProgressRing } from "@/components/progress-ring"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { hasAccessModule, localDateKey, type LeaveType } from "@hbcfield/shared/client"
import type { TimeOffRequest } from "@hbcfield/shared"
import { keys } from "@/lib/query-keys"
import { formatDayMonth, formatMediumDate, formatMonthYear } from "@/lib/format-date"
import { serverErrorMessage } from "@/lib/server-error"
import { useRequestOptions } from "@/hooks/use-request-options"
import {
  LEAVE_TYPE_REASON_KEY, absencesOnly, draftToRequest, isAbsence, isOneDayKind, requestDetail, requestKindEffectKey,
  type RequestKind,
} from "@/lib/requests"
import { RequestKindChip, RequestKindPicker } from "@/components/requests/request-kind"
import { RequestFields, type RequestFieldsValue } from "@/components/requests/request-fields"
import { LeaveBalanceBreakdown } from "@/components/leave/leave-balance-breakdown"
import { balanceView, leaveYearLabel } from "@/lib/leave-ledger"

/*
  Leave products lead with three things: allowance remaining, who else is away,
  and where a request has got to.

  The allowance is real now — TimeOff carries a `type`, and only VACATION is
  deducted, because an allowance that eats sick days is a penalty for being ill.
  APPROVED days are subtracted; PENDING days are shown beside the figure rather
  than inside it, so a request nobody has looked at yet does not silently reduce
  what someone believes they have.

  A team calendar is still not built: a member has no permission to read
  colleagues' absence, so it would be empty or forbidden depending on who
  looked. Their own booked days ARE drawn on the calendar, which answers the
  question the team view is usually reached for — "does this clash?".
*/

/*
  Drawn here rather than taken from an icon set.

  A plane for vacation and a stethoscope for sickness are the literal reading,
  and they date a page instantly — every product used them a decade ago. These
  are four glyphs in one geometric language (a 24-grid, 1.75 stroke, round
  caps), each carrying its own hue, so the row reads as a considered set rather
  than four unrelated pictures. The colour does most of the work: after the
  first use, people pick by hue, not by squinting at a small drawing.
*/
function SunGlyph(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" {...p}>
      <circle cx="12" cy="11" r="4" />
      <path d="M12 3v1.5M12 17.5V19M4.2 11H5.7M18.3 11h1.5M6.5 5.5l1 1M16.5 5.5l-1 1" />
      <path d="M3 20.5c1.6 0 1.6-1.2 3.2-1.2s1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2" />
    </svg>
  )
}
function PulseGlyph(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 12h3.5l2-5 3 10 2.5-5H21" />
    </svg>
  )
}
function FamilyGlyph(p: React.SVGProps<SVGSVGElement>) {
  /*
    Two figures, not one.

    A single head-and-shoulders is the default avatar shape — it reads as "user
    account", which is what it means everywhere else in this app, and says
    nothing about why someone is away. Personal leave is overwhelmingly a family
    matter: childcare, an appointment, someone at home who needs you. A second,
    smaller figure names that, and is a shape nothing else here uses.
  */
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" {...p}>
      <circle cx="8.75" cy="7" r="2.75" />
      <path d="M4 19.5c0-2.9 2.1-4.75 4.75-4.75S13.5 16.6 13.5 19.5" />
      <circle cx="17" cy="10.5" r="2" />
      <path d="M13.9 19.5c0-2.05 1.4-3.4 3.1-3.4s3.1 1.35 3.1 3.4" />
    </svg>
  )
}
function DotsGlyph(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" {...p}>
      <circle cx="12" cy="12" r="8.5" strokeDasharray="3 3.2" />
      <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" strokeWidth="2.4" />
    </svg>
  )
}

/*
  Monochrome on purpose.

  Giving each reason its own hue is the old tag-colour pattern: four saturated
  swatches competing on one small panel, none of which mean anything until you
  have learnt the legend. It also fights the rest of the page, where colour is
  reserved for STATE — amber for pending, green for approved, the accent for
  what is selected. Spending it on identity too leaves nothing to say "this one
  is chosen".

  So the cards are neutral and selection is the only thing that colours.
*/
const REASON_TYPES = [
  { key: "vacation", glyph: SunGlyph },
  { key: "sickLeave", glyph: PulseGlyph },
  { key: "family", glyph: FamilyGlyph },
  { key: "other", glyph: DotsGlyph },
] as const
type ReasonKey = (typeof REASON_TYPES)[number]["key"]

/** UI key → stored enum (the inverse of the shared web map). Only VACATION is deducted from the allowance. */
const REASON_TO_TYPE = Object.fromEntries(
  Object.entries(LEAVE_TYPE_REASON_KEY).map(([type, key]) => [key, type]),
) as Record<ReasonKey, LeaveType>

const EMPTY_FIELDS: RequestFieldsValue = { spaceId: "", startTime: "", endTime: "", minutes: 60, reason: "" }

const STATUS_STYLES: Record<string, string> = {
  PENDING: "text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-500/15",
  APPROVED: "text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-500/15",
  REJECTED: "text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-500/15",
  CANCELED: "text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-500/15",
}

const toISO = (d: Date) => localDateKey(d)
const sameDay = (a: Date, b: Date) => toISO(a) === toISO(b)
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000)

function fmt(iso?: string): string {
  if (!iso) return "—"
  // A bare day key is read at LOCAL midnight — `new Date("2026-10-05")` is UTC
  // midnight, which west of Greenwich is still the 4th.
  return formatMediumDate(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso)
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

/*
  Requests — this page grew from "time off" into everything a member asks the
  person responsible for them: leave, a remote day, a changed day, overtime
  agreed in advance, anything else. The kind is chosen FIRST; leave keeps every
  part of the old form (reason cards, working-day cost, clash warning), the
  other kinds swap in their own few fields. Validity is asked of the shared
  parser, so the button refuses exactly what the server would.
*/
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

  const options = useRequestOptions(canSee)
  const [kind, setKind] = useState<RequestKind>("LEAVE")
  const [fields, setFields] = useState<RequestFieldsValue>(EMPTY_FIELDS)
  const [reasonType, setReasonType] = useState<ReasonKey | null>(null)
  const [notes, setNotes] = useState("")
  const [rangeStart, setRangeStart] = useState<Date | null>(null)
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null)
  const [hovered, setHovered] = useState<Date | null>(null)
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  /* "How is this counted?" — the balance's lines, opened on demand beside the ring. */
  const [showLines, setShowLines] = useState(false)
  /*
    Opened from the calendar's New › Time off (`?from=YYYY-MM-DD`): the request starts on that
    day and the month opens on it. Read once after mount (the server has no address bar);
    anything malformed or in the past is ignored.
  */
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("from")
    const d = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : null
    if (d && !Number.isNaN(d.getTime()) && d >= startOfDay(new Date())) {
      setRangeStart(d); setRangeEnd(d); setCursor(startOfDay(d))
    }
  }, [])

  // A kind the server no longer offers (a workspace changed its list) falls back to the first it does.
  useEffect(() => {
    if (options.ready && !options.kinds.includes(kind)) setKind(options.kinds[0] ?? "LEAVE")
  }, [options.ready, options.kinds, kind])
  // One workspace a remote day can go to: chosen for you.
  useEffect(() => {
    if (options.remoteSpaces.length === 1 && !fields.spaceId) setFields((f) => ({ ...f, spaceId: options.remoteSpaces[0]!.id }))
  }, [options.remoteSpaces, fields.spaceId])

  const today = startOfDay(new Date())
  const weeks = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor])

  const { data: requests, isLoading } = useQuery({
    queryKey: keys.timeOff.mine(user?.id),
    queryFn: () => employeesApi.getTimeOff(user!.id),
    enabled: canSee && !!user?.id,
  })
  const { data: balance } = useQuery({
    queryKey: keys.timeOff.myBalance(user?.id),
    queryFn: () => employeesApi.getLeaveBalance(user!.id),
    enabled: canSee && !!user?.id,
  })

  const balanceLines = balanceView(balance)
  const yearLabel = balanceLines ? leaveYearLabel(balanceLines, (d) => formatDayMonth(`${d}T12:00:00`, false)) : null

  const refetch = () => {
    qc.invalidateQueries({ queryKey: keys.timeOff.mine(user?.id) })
    qc.invalidateQueries({ queryKey: keys.timeOff.myBalance(user?.id) })
  }

  const list = useMemo<TimeOffRequest[]>(() => (requests as TimeOffRequest[]) ?? [], [requests])
  // Every request marks its days on the calendar; only LEAVE can clash with leave.
  const booked = useMemo(() => bookedDays(list), [list])
  const bookedLeave = useMemo(() => bookedDays(absencesOnly(list)), [list])

  // Real figures only — every one is derived from the person's own requests.
  const stats = useMemo(() => {
    const year = today.getFullYear()
    let daysThisYear = 0
    let pending = 0
    let next: TimeOffRequest | null = null
    for (const r of list) {
      if (r.status === "PENDING") pending++
      if (r.status === "REJECTED" || r.status === "CANCELED") continue
      // Days off are leave only — a remote day or a changed day is a day worked.
      if (!isAbsence(r.kind)) continue
      const s = startOfDay(new Date(r.startDate))
      const e = startOfDay(new Date(r.endDate))
      // What it COSTS (weekends and holidays left out); old rows without a count fall back to the span.
      if (s.getFullYear() === year) daysThisYear += r.workingDays ?? dayDiff(s, e) + 1
      if (s >= today && (!next || s < startOfDay(new Date(next.startDate)))) next = r
    }
    return { daysThisYear, pending, next }
  }, [list, today])

  const reset = () => {
    setReasonType(null); setNotes(""); setRangeStart(null); setRangeEnd(null); setHovered(null)
    setFields((f) => ({ ...EMPTY_FIELDS, spaceId: options.remoteSpaces.length === 1 ? f.spaceId : "" }))
  }

  const chooseKind = (next: RequestKind) => {
    setKind(next)
    // A changed day and agreed overtime are ONE day: keep the first day picked.
    if (isOneDayKind(next) && rangeStart) setRangeEnd(rangeStart)
  }

  /*
    The request as the shared parser reads it. Leave's reason is composed
    exactly as the phone composes it, from the same four keys.
  */
  const draft = useMemo(() => {
    const leaveLabel = reasonType ? t(`timeOff.reasonTypes.${reasonType}`) : ""
    const reason = kind === "LEAVE"
      ? (notes.trim() ? `${leaveLabel}: ${notes.trim()}` : leaveLabel)
      : fields.reason
    return draftToRequest({
      kind,
      startDate: rangeStart ? toISO(rangeStart) : null,
      endDate: rangeEnd ? toISO(rangeEnd) : rangeStart ? toISO(rangeStart) : null,
      leaveType: reasonType ? REASON_TO_TYPE[reasonType] : null,
      spaceId: fields.spaceId,
      startTime: fields.startTime,
      endTime: fields.endTime,
      minutes: kind === "OVERTIME" ? fields.minutes : null,
      reason,
    })
  }, [kind, reasonType, notes, fields, rangeStart, rangeEnd, t])

  const createMut = useMutation({
    mutationFn: () => {
      if (!draft.ok) throw new Error(t(`serverErrors.${draft.code}`))
      return employeesApi.requestTimeOff(user!.id, draft.value)
    },
    onSuccess: () => {
      notify.success(t("requests.form.sentTitle"), t("timeOff.my.requestedDesc"))
      reset(); refetch()
    },
    onError: (e) => notify.error(serverErrorMessage(e, t) || t("timeOff.my.submitError")),
  })

  const cancelMut = useMutation({
    mutationFn: (id: string) => employeesApi.cancelTimeOff(id),
    onSuccess: () => { notify.success(t("timeOff.my.canceledToast")); refetch() },
    onError: (e) => notify.error(serverErrorMessage(e, t) || t("timeOff.my.cancelError")),
  })

  // One click books a day; a second extends it either way. Single-day is the
  // common case, so it is the default rather than a mode to pick first.
  const pickDay = (d: Date) => {
    if (d < today) return
    if (isOneDayKind(kind)) { setRangeStart(d); setRangeEnd(d); return }
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
  /*
    What the range COSTS, asked of the server — the one rule (shared calendar/days.ts) that also
    decides the request and the balance. Weekends, rota rest days and holidays cost nothing.
  */
  const { data: cost } = useQuery({
    queryKey: keys.timeOff.count(user?.id, rangeStart ? toISO(rangeStart) : null, selectedEnd ? toISO(selectedEnd) : null),
    queryFn: () => calendarApi.countLeave(user!.id, toISO(rangeStart!), toISO(selectedEnd!)),
    // Only leave costs working days — nothing to ask for any other kind.
    enabled: kind === "LEAVE" && !!user?.id && !!rangeStart && !!selectedEnd,
    staleTime: 60_000,
  })

  // Caught before submitting rather than after a manager rejects it.
  const clash = useMemo(() => {
    if (kind !== "LEAVE" || !rangeStart || !selectedEnd) return null
    for (let d = rangeStart; d <= selectedEnd; d = addDays(d, 1)) {
      const hit = bookedLeave.get(toISO(d))
      if (hit) return hit
    }
    return null
  }, [kind, rangeStart, selectedEnd, bookedLeave])

  const canSubmit = draft.ok && (kind !== "LEAVE" || !!reasonType) && !clash && !createMut.isPending
  // Said once there are dates to judge; muted — it is guidance, not a refusal yet.
  const problem = rangeStart && !draft.ok ? t(`serverErrors.${draft.code}`) : null
  // After every hook — an early return above them changes the hook order between renders.
  if (!canSee) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">
        {t("timeOff.my.noAccess")}
      </div>
    )
  }

  const weekdays = t("timeOff.my.weekdays", { defaultValue: "Mo,Tu,We,Th,Fr,Sa,Su" }).split(",")
  const monthLabel = formatMonthYear(cursor)

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("nav.timeOff")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("timeOff.my.subtitle")}</p>
      </header>

      {/* The allowance, and what is actually left of it. */}
      <div className="mb-5 grid gap-3 sm:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4">
          <ProgressRing
            tone="low"
            value={balance?.remaining ?? 0}
            total={balance?.allowance ?? 0}
            caption={(balance?.allowance ?? 0) > 0 ? `/ ${balance?.allowance}` : ""}
            loading={!balance}
          />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {yearLabel?.kind === "work"
                ? t("leaveLedger.allowanceTitleWork", { from: yearLabel.from, to: yearLabel.to })
                : t("timeOff.my.allowanceTitle", { year: yearLabel?.year ?? new Date().getFullYear() })}
            </p>
            <p className="mt-1 text-sm text-foreground">
              {t("timeOff.my.allowanceOf", { taken: balance?.taken ?? 0, total: balance?.allowance ?? 0 })}
            </p>
            {!!balance?.pending && (
              /* Beside the figure, never inside it: a request nobody has
                 approved yet is not time the person has taken. */
              <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                {t("timeOff.my.allowancePending", { count: balance.pending })}
              </p>
            )}
            {balance && (
              <button
                type="button"
                aria-expanded={showLines}
                onClick={() => setShowLines((v) => !v)}
                className="mt-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                {showLines ? t("leaveLedger.hideLines") : t("leaveLedger.showLines")}
              </button>
            )}
            {balance?.prorated && (
              /* A joiner sees a number nobody else has. Unexplained, that reads
                 as an error or as being short-changed — so it says why, and
                 what a full year would have been. */
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("timeOff.my.allowanceProrated", {
                  full: balance.fullAllowance ?? 0,
                  date: balance.startedOn ? fmt(balance.startedOn) : "",
                })}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat icon={Clock3} value={String(stats.pending)} label={t("timeOff.my.statPending")}
                tone={stats.pending > 0 ? "amber" : undefined} />
          <Stat icon={CalendarDays} small
                value={stats.next ? fmt(stats.next.startDate) : "—"}
                label={t("timeOff.my.statNext")} />
        </div>
      </div>
      {showLines && balance && (
        <LeaveBalanceBreakdown balance={balance} className="mb-5 bg-card sm:max-w-md" />
      )}

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
                      "absolute bottom-1 rounded-full",
                      isAbsence(book.kind)
                        ? cn("h-1 w-1", book.status === "APPROVED" ? "bg-green-500" : "bg-amber-500")
                        // Not a day off — a ring, so it never reads as leave.
                        : cn("h-1.5 w-1.5 border", book.status === "APPROVED" ? "border-green-500" : "border-amber-500"),
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
            {options.kinds.length > 1 && (
              <Legend className="border border-muted-foreground bg-transparent" label={t("requests.legendNotLeave")} />
            )}
          </div>
        </section>

        {/* ── Request ──────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          {options.kinds.length > 1 && (
            <div className="mb-4 border-b border-border pb-4">
              <h2 className="mb-2.5 text-sm font-semibold text-foreground">{t("requests.form.kindQuestion")}</h2>
              <RequestKindPicker kinds={options.kinds} value={kind} onChange={chooseKind} />
            </div>
          )}
          {kind !== "LEAVE" ? (
            <RequestFields
              kind={kind}
              value={fields}
              onChange={(patch) => setFields((f) => ({ ...f, ...patch }))}
              remoteSpaces={options.remoteSpaces}
            />
          ) : (
          <>
          <h2 className="text-sm font-semibold text-foreground">{t("timeOff.my.stepReason")}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {REASON_TYPES.map(({ key, glyph: Glyph }) => {
              const active = reasonType === key
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setReasonType(active ? null : key)}
                  className={cn(
                    "group relative flex flex-col items-center gap-2 rounded-2xl border px-2 py-3.5 transition-all duration-200",
                    "motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-foreground bg-foreground text-background shadow-sm"
                      : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
                  )}
                >
                  <Glyph
                    className={cn(
                      "size-6 stroke-current transition-transform duration-200",
                      active && "motion-safe:scale-110",
                    )}
                  />
                  <span className="text-[11px] font-medium leading-none">{t(`timeOff.reasonTypes.${key}`)}</span>
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
          </>
          )}

          <div className={cn("grid transition-all duration-300 ease-out",
            rangeStart ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
            <div className="overflow-hidden space-y-2">
              <div className="rounded-xl bg-muted/50 px-3 py-2.5">
                <p className="text-sm text-foreground">
                  {rangeStart && fmt(toISO(rangeStart))}
                  {rangeEnd && !sameDay(rangeEnd, rangeStart!) && <> → {fmt(toISO(rangeEnd))}</>}
                </p>
                {kind === "LEAVE" ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {cost && cost.counted !== cost.calendarDays
                    ? t("timeOff.my.workingDayCount", { count: cost.counted, total: cost.calendarDays })
                    : t("timeOff.my.dayCount", { count: cost?.counted ?? dayCount })}
                </p>
                ) : !isOneDayKind(kind) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("timeOff.my.dayCount", { count: dayCount })}</p>
                )}
                {kind === "LEAVE" && cost && (cost.restDays > 0 || cost.holidays.length > 0) && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {[
                      cost.restDays > 0 ? t("timeOff.my.restDaysLeftOut", { count: cost.restDays }) : null,
                      ...cost.holidays.map((h) => `${h.name}${h.halfDay ? ` (${t("timeOff.my.halfDay")})` : ""}`),
                    ].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              {kind === "LEAVE" && reasonType === "vacation" && balance && (
                /* Only vacation is deducted: the balance before and after, line by line — the drawer shows the same. */
                <LeaveBalanceBreakdown balance={balance} requestDays={cost?.counted ?? dayCount} compact />
              )}
              {kind !== "LEAVE" && (
                /* What approving it will do — said BEFORE sending, the same words the manager reads. */
                <p className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                  {t(requestKindEffectKey(kind))}
                </p>
              )}
              {problem && <p className="px-1 text-xs text-muted-foreground">{problem}</p>}
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
              {t("requests.form.send")}
            </Button>
            {(reasonType || rangeStart || fields.reason) && (
              <Button variant="ghost" size="sm" onClick={reset} disabled={createMut.isPending}>
                {t("common.clear", { defaultValue: "Clear" })}
              </Button>
            )}
          </div>
          {!rangeStart && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {isOneDayKind(kind) ? t("requests.form.pickDayHint") : t("timeOff.my.pickDaysHint")}
            </p>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {fmt(r.startDate)}{r.endDate.slice(0, 10) !== r.startDate.slice(0, 10) && <> → {fmt(r.endDate)}</>}
                    </p>
                    {(options.kinds.length > 1 || !isAbsence(r.kind)) && <RequestKindChip kind={r.kind} />}
                    {!isAbsence(r.kind) && requestDetail(r, t) && (
                      <span className="text-xs text-muted-foreground">{requestDetail(r, t)}</span>
                    )}
                  </div>
                  {r.reason && <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.reason}</p>}
                  {r.status === "REJECTED" && r.rejectionReason && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {/* The string carries its own "Rejected:" prefix AND a
                          {{reason}} placeholder. Calling t() without the value
                          and appending the reason by hand printed the literal
                          placeholder, then the reason, after a second colon. */}
                      {t("timeOff.my.rejectedReason", { reason: r.rejectionReason })}
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

/**
 * Remaining vacation as a ring.
 *
 * Only the APPROVED portion is filled. Pending days are reported next to it in
 * words rather than shaded in, because a half-shaded ring reads as "already
 * gone" for days a manager has not yet agreed to.
 */

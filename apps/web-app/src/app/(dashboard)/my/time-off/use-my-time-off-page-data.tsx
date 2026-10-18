"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"
import { employeesApi } from "@/lib/api"
import { hasAccessModule, localDateKey } from "@hbcfield/shared/client"
import type { TimeOffRequest } from "@hbcfield/shared"
import { keys } from "@/lib/query-keys"
import { formatDayMonth } from "@/lib/format-date"
import { useRequestOptions } from "@/hooks/use-request-options"
import { absencesOnly, isAbsence, type RequestKind } from "@/lib/requests"
import { type RequestFieldsValue } from "@/components/requests/request-fields"
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
export const REASON_TYPES = [
  { key: "vacation", glyph: SunGlyph },
  { key: "sickLeave", glyph: PulseGlyph },
  { key: "family", glyph: FamilyGlyph },
  { key: "other", glyph: DotsGlyph },
] as const

export type ReasonKey = (typeof REASON_TYPES)[number]["key"]

export const EMPTY_FIELDS: RequestFieldsValue = { spaceId: "", startTime: "", endTime: "", minutes: 60, reason: "" }

export const toISO = (d: Date) => localDateKey(d)

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

export const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000)

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

/** useMyTimeOffPage's state and handlers — everything before its markup, moved here unchanged. */
export function useMyTimeOffPageData() {
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

  return {
    t,
    user,
    canSee,
    STATUS_LABELS,
    options,
    kind,
    setKind,
    fields,
    setFields,
    reasonType,
    setReasonType,
    notes,
    setNotes,
    rangeStart,
    setRangeStart,
    rangeEnd,
    setRangeEnd,
    hovered,
    setHovered,
    cursor,
    setCursor,
    showLines,
    setShowLines,
    today,
    weeks,
    isLoading,
    balance,
    yearLabel,
    refetch,
    list,
    booked,
    bookedLeave,
    stats,
  }
}

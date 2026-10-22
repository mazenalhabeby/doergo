"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation } from "@tanstack/react-query"
import { calendarApi, employeesApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { type LeaveType } from "@hbcfield/shared/client"
import type { TimeOffRequest } from "@hbcfield/shared"
import { keys } from "@/lib/query-keys"
import { serverErrorMessage } from "@/lib/server-error"
import {
  LEAVE_TYPE_REASON_KEY,
  draftToRequest,
  isOneDayKind,
  type RequestKind,
  type RequestOptions,
} from "@/lib/requests"
import { type RequestFieldsValue } from "@/components/requests/request-fields"
import { type ReasonKey } from "../_components/reason-types"
import { addDays, dayDiff, sameDay, startOfDay, toISO } from "../_lib/request-calendar"

/** UI key → stored enum (the inverse of the shared web map). Only VACATION is deducted from the allowance. */
const REASON_TO_TYPE = Object.fromEntries(
  Object.entries(LEAVE_TYPE_REASON_KEY).map(([type, key]) => [key, type]),
) as Record<ReasonKey, LeaveType>

const EMPTY_FIELDS: RequestFieldsValue = { spaceId: "", startTime: "", endTime: "", minutes: 60, reason: "" }

/**
 * The request being written: its kind, its fields, the days picked on the calendar (and the month
 * shown), what the range costs, whether it clashes — and sending it.
 */
export function useRequestForm({
  userId,
  options,
  today,
  refetch,
  bookedLeave,
}: {
  userId: string | undefined
  options: RequestOptions & { ready: boolean }
  today: Date
  /** Re-read the member's requests and balance after one is sent. */
  refetch: () => void
  /** Days already taken by leave — a new leave request on one of them clashes. */
  bookedLeave: Map<string, TimeOffRequest>
}) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<RequestKind>("LEAVE")
  const [fields, setFields] = useState<RequestFieldsValue>(EMPTY_FIELDS)
  const [reasonType, setReasonType] = useState<ReasonKey | null>(null)
  const [notes, setNotes] = useState("")
  const [rangeStart, setRangeStart] = useState<Date | null>(null)
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null)
  const [hovered, setHovered] = useState<Date | null>(null)
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  /*
    Opened from the calendar's New › Time off (`?from=YYYY-MM-DD`): the request starts on that
    day and the month opens on it. Read once after mount (the server has no address bar);
    anything malformed or in the past is ignored.
  */
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("from")
    const d = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : null
    if (d && !Number.isNaN(d.getTime()) && d >= startOfDay(new Date())) {
      setRangeStart(d)
      setRangeEnd(d)
      setCursor(startOfDay(d))
    }
  }, [])

  // A kind the server no longer offers (a workspace changed its list) falls back to the first it does.
  useEffect(() => {
    if (options.ready && !options.kinds.includes(kind)) setKind(options.kinds[0] ?? "LEAVE")
  }, [options.ready, options.kinds, kind])
  // One workspace a remote day can go to: chosen for you.
  useEffect(() => {
    if (options.remoteSpaces.length === 1 && !fields.spaceId)
      setFields((f) => ({ ...f, spaceId: options.remoteSpaces[0]!.id }))
  }, [options.remoteSpaces, fields.spaceId])

  const reset = () => {
    setReasonType(null)
    setNotes("")
    setRangeStart(null)
    setRangeEnd(null)
    setHovered(null)
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
    const reason = kind === "LEAVE" ? (notes.trim() ? `${leaveLabel}: ${notes.trim()}` : leaveLabel) : fields.reason
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
      return employeesApi.requestTimeOff(userId!, draft.value)
    },
    onSuccess: () => {
      notify.success(t("requests.form.sentTitle"), t("timeOff.my.requestedDesc"))
      reset()
      refetch()
    },
    onError: (e) => notify.error(serverErrorMessage(e, t) || t("timeOff.my.submitError")),
  })

  // One click books a day; a second extends it either way. Single-day is the
  // common case, so it is the default rather than a mode to pick first.
  const pickDay = (d: Date) => {
    if (d < today) return
    if (isOneDayKind(kind)) {
      setRangeStart(d)
      setRangeEnd(d)
      return
    }
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(d)
      setRangeEnd(null)
      return
    }
    if (sameDay(d, rangeStart)) {
      setRangeEnd(d)
      return
    }
    if (d < rangeStart) {
      setRangeEnd(rangeStart)
      setRangeStart(d)
    } else {
      setRangeEnd(d)
    }
  }

  const effectiveEnd = rangeEnd ?? (rangeStart && hovered && hovered > rangeStart ? hovered : null)
  const inRange = (d: Date) => !!rangeStart && !!effectiveEnd && d > rangeStart && d < effectiveEnd
  const isEdge = (d: Date) => (!!rangeStart && sameDay(d, rangeStart)) || (!!effectiveEnd && sameDay(d, effectiveEnd))

  const selectedEnd = rangeEnd ?? rangeStart
  const dayCount = rangeStart && selectedEnd ? dayDiff(rangeStart, selectedEnd) + 1 : 0
  /*
    What the range COSTS, asked of the server — the one rule (shared calendar/days.ts) that also
    decides the request and the balance. Weekends, rota rest days and holidays cost nothing.
  */
  const { data: cost } = useQuery({
    queryKey: keys.timeOff.count(
      userId,
      rangeStart ? toISO(rangeStart) : null,
      selectedEnd ? toISO(selectedEnd) : null,
    ),
    queryFn: () => calendarApi.countLeave(userId!, toISO(rangeStart!), toISO(selectedEnd!)),
    // Only leave costs working days — nothing to ask for any other kind.
    enabled: kind === "LEAVE" && !!userId && !!rangeStart && !!selectedEnd,
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

  return {
    kind,
    fields,
    setFields,
    reasonType,
    setReasonType,
    notes,
    setNotes,
    rangeStart,
    rangeEnd,
    setHovered,
    cursor,
    setCursor,
    reset,
    chooseKind,
    createMut,
    pickDay,
    inRange,
    isEdge,
    dayCount,
    cost,
    clash,
    canSubmit,
    problem,
  }
}

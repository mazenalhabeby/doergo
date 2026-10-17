"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"
import { calendarApi, employeesApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { hasAccessModule, localDateKey, type LeaveType } from "@hbcfield/shared/client"
import type { TimeOffRequest } from "@hbcfield/shared"
import { keys } from "@/lib/query-keys"
import { formatDayMonth } from "@/lib/format-date"
import { serverErrorMessage } from "@/lib/server-error"
import { useRequestOptions } from "@/hooks/use-request-options"
import {
  LEAVE_TYPE_REASON_KEY,
  absencesOnly,
  draftToRequest,
  isAbsence,
  isOneDayKind,
  type RequestKind,
} from "@/lib/requests"
import { type RequestFieldsValue } from "@/components/requests/request-fields"
import { balanceView, leaveYearLabel } from "@/lib/leave-ledger"
import { useMyTimeOffPageData, EMPTY_FIELDS, type ReasonKey, dayDiff, addDays, toISO } from "./use-my-time-off-page-data"
export {
  EMPTY_FIELDS,
  type ReasonKey,
  dayDiff,
  addDays,
  toISO,
  startOfDay,
  monthGrid,
  bookedDays,
  REASON_TYPES,
  SunGlyph,
  PulseGlyph,
  FamilyGlyph,
  DotsGlyph
} from "./use-my-time-off-page-data"

/** UI key → stored enum (the inverse of the shared web map). Only VACATION is deducted from the allowance. */
export const REASON_TO_TYPE = Object.fromEntries(
  Object.entries(LEAVE_TYPE_REASON_KEY).map(([type, key]) => [key, type]),
) as Record<ReasonKey, LeaveType>

export const sameDay = (a: Date, b: Date) => toISO(a) === toISO(b)

/** MyTimeOffPage's state and handlers — everything before its markup, moved here unchanged. */
export function useMyTimeOffPage() {
  const {
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
  } = useMyTimeOffPageData()

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

  return {
    t,
    canSee,
    STATUS_LABELS,
    options,
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
    showLines,
    setShowLines,
    today,
    weeks,
    isLoading,
    balance,
    yearLabel,
    list,
    booked,
    stats,
    reset,
    chooseKind,
    createMut,
    cancelMut,
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

/** What MyTimeOffPage and its sections read. */
export type MyTimeOffPageState = ReturnType<typeof useMyTimeOffPage>

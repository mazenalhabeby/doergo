"use client"

import { useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"
import { employeesApi } from "@/lib/api"
import { hasAccessModule } from "@hbcfield/shared/client"
import type { TimeOffRequest } from "@hbcfield/shared"
import { keys } from "@/lib/query-keys"
import { formatDayMonth } from "@/lib/format-date"
import { useRequestOptions } from "@/hooks/use-request-options"
import { absencesOnly, isAbsence } from "@/lib/requests"
import { balanceView, leaveYearLabel } from "@/lib/leave-ledger"
import { bookedDays, dayDiff, startOfDay } from "../_lib/request-calendar"

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

/** The member's own requests and leave balance, and what the page works out from them. */
export function useMyRequests() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const canSee = !user || hasAccessModule(user, "time_off")
  const options = useRequestOptions(canSee)
  const today = startOfDay(new Date())

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
    user,
    canSee,
    options,
    today,
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

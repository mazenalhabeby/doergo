"use client"

import { useQuery } from "@tanstack/react-query"
import { parseISO, differenceInCalendarDays } from "date-fns"
import { employeesApi, type OrgTimeOffRequest } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { isAbsence, requestKindOf } from "@/lib/requests"
import { COVER_TONE } from "../_lib/cover-labels"

/** What deciding one request needs to know: its kind, cover, cost, the allowance, the usual hours, the jobs it orphans. */
export function useRequestFacts(request: OrgTimeOffRequest) {
  const kind = requestKindOf(request.kind)
  const leave = isAbsence(kind)
  // Cover is a question about ABSENCE — a remote day or a changed day leaves the floor as it is.
  const v = leave ? request.cover : null
  const tone = v ? COVER_TONE[v.level] : null
  const span = differenceInCalendarDays(parseISO(request.endDate), parseISO(request.startDate)) + 1
  // What it costs (weekends, rota rest days and holidays left out); old rows have no count yet.
  const days = request.workingDays ?? span
  const pendingVacation = leave && request.status === "PENDING" && (request.type ?? "VACATION") === "VACATION"

  /* The allowance, before and after — only vacation is deducted from it. */
  const { data: balance } = useQuery({
    queryKey: keys.timeOff.myBalance(request.technicianId),
    queryFn: () => employeesApi.getLeaveBalance(request.technicianId),
    staleTime: 60_000,
    enabled: pendingVacation,
  })

  /* A changed day is judged against the day it changes: their usual hours on that weekday. */
  const { data: schedule } = useQuery({
    queryKey: keys.schedules.member(request.technicianId),
    queryFn: () => employeesApi.getSchedule(request.technicianId),
    staleTime: 60_000,
    enabled: kind === "HOURS" || kind === "OVERTIME",
  })
  const usual = (() => {
    const dow = parseISO(request.startDate.slice(0, 10)).getDay()
    const e = schedule?.schedule?.find((s) => s.dayOfWeek === dow && s.isActive)
    return e ? { start: e.startTime, end: e.endTime } : null
  })()

  /*
    The jobs already booked inside the window.

    No leave tool knows this and this product does: approving the days is what
    makes those visits somebody else's problem, so they belong in the decision
    rather than in a surprise on the morning.
  */
  const { data: jobs = [] } = useQuery({
    queryKey: keys.timeOff.memberTasksInWindow(request.technicianId, request.startDate, request.endDate),
    queryFn: () =>
      employeesApi.getTasks(request.technicianId, {
        startDate: request.startDate.slice(0, 10),
        endDate: request.endDate.slice(0, 10),
        limit: 20,
      }),
    staleTime: 60_000,
    // Only an absence hands jobs over — somebody working remotely still does theirs.
    enabled: request.status === "PENDING" && isAbsence(request.kind),
  })

  // Only work that still needs doing. A job already finished inside the window
  // is not a handover, and listing it would inflate the number that matters.
  const openJobs = jobs.filter((j) => j.status !== "COMPLETED" && j.status !== "CLOSED" && j.status !== "CANCELED")

  return {
    kind,
    leave,
    v,
    tone,
    span,
    days,
    pendingVacation,
    balance,
    usual,
    openJobs,
  }
}

"use client"

import { keys } from "@/lib/query-keys"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { addDays, format, startOfWeek } from "date-fns"
import { notify } from "@/lib/toast"
import { rotaApi, spaceMembersApi } from "@/lib/api"
import { type ShiftAssignment, ShiftRecurrence } from "@hbcfield/shared/client"

// 0=Sun..6=Sat to match backend daysOfWeek.
export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

/**
 * Does an assignment apply on a given calendar day? Resolves the recurrence
 * against the effective window. Date comparisons are done on yyyy-MM-dd strings
 * to sidestep timezone drift (matches how the day is displayed to the admin).
 */
function assignmentAppliesOn(a: ShiftAssignment, day: Date, dayStr: string): boolean {
  const from = a.effectiveFrom?.slice(0, 10)
  const to = a.effectiveTo?.slice(0, 10)
  if (from && dayStr < from) return false
  if (to && dayStr > to) return false
  switch (a.recurrence) {
    case ShiftRecurrence.DAILY:
      return true
    case ShiftRecurrence.WEEKLY:
      return a.daysOfWeek?.includes(day.getDay()) ?? false
    case ShiftRecurrence.MONTHLY:
      return a.daysOfMonth?.includes(day.getDate()) ?? false
    case ShiftRecurrence.ONE_OFF:
      return a.dates?.some((d) => d.slice(0, 10) === dayStr) ?? false
    default:
      return false
  }
}

/** "HH:MM" → minutes since midnight. */
function hhmmToMin(hhmm?: string): number {
  if (!hhmm) return 0
  const [h, m] = hhmm.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** A shift's [start, end) window in minutes; night shifts extend past 1440. */
function shiftWindow(shift?: { startLocal: string; endLocal: string; crossesMidnight?: boolean }): [number, number] {
  if (!shift) return [0, 0]
  const s = hhmmToMin(shift.startLocal)
  let e = hhmmToMin(shift.endLocal)
  if (shift.crossesMidnight || e <= s) e += 1440
  return [s, e]
}

/** Do any two of a day's assignments have overlapping shift times? */
export function cellHasConflict(cell: ShiftAssignment[]): boolean {
  for (let i = 0; i < cell.length; i++) {
    for (let j = i + 1; j < cell.length; j++) {
      const [s1, e1] = shiftWindow(cell[i].shift)
      const [s2, e2] = shiftWindow(cell[j].shift)
      if (s1 < e2 && s2 < e1) return true
    }
  }
  return false
}

/** RotaTab's state and handlers — everything before its markup, moved here unchanged. */
export function useRotaTab({ spaceId }: Pick<{ spaceId: string }, 'spaceId'>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ShiftAssignment | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ShiftAssignment | null>(null)

  const { data: assignments, isLoading } = useQuery({
    queryKey: keys.schedules.rota(spaceId),
    queryFn: () => rotaApi.list(spaceId),
    staleTime: 30_000,
  })
  // Space members — to surface who works "open hours" (no shift assigned).
  const { data: spaceMembers } = useQuery({
    queryKey: keys.spaceMembers.list(spaceId),
    queryFn: () => spaceMembersApi.list(spaceId),
    staleTime: 30_000,
  })

  // Week navigator (weeks start Monday).
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )
  const dayStrs = useMemo(() => days.map((d) => format(d, "yyyy-MM-dd")), [days])
  const todayStr = format(new Date(), "yyyy-MM-dd")

  // Scheduled members = anyone with an assignment (deduped, name-sorted).
  const scheduledMembers = useMemo(() => {
    const map = new Map<string, { id: string; first: string; last: string }>()
    for (const a of assignments ?? []) {
      if (a.user && !map.has(a.userId)) {
        map.set(a.userId, { id: a.userId, first: a.user.firstName, last: a.user.lastName })
      }
    }
    return [...map.values()].sort((x, y) => `${x.first} ${x.last}`.localeCompare(`${y.first} ${y.last}`))
  }, [assignments])

  // Open-hours members = space members not on the rota.
  const openMembers = useMemo(() => {
    const scheduledIds = new Set(scheduledMembers.map((m) => m.id))
    return (spaceMembers ?? [])
      .filter((m) => m.user && !scheduledIds.has(m.userId))
      .map((m) => ({ id: m.userId, first: m.user!.firstName, last: m.user!.lastName }))
      .sort((x, y) => `${x.first} ${x.last}`.localeCompare(`${y.first} ${y.last}`))
  }, [spaceMembers, scheduledMembers])

  // Index assignments by member once, so a cell filters only that member's
  // slice instead of re-scanning the whole array members×7 times per render.
  const byUser = useMemo(() => {
    const map = new Map<string, ShiftAssignment[]>()
    for (const a of assignments ?? []) {
      const arr = map.get(a.userId)
      if (arr) arr.push(a)
      else map.set(a.userId, [a])
    }
    return map
  }, [assignments])

  const cellFor = (userId: string, day: Date, dayStr: string) =>
    (byUser.get(userId) ?? []).filter((a) => assignmentAppliesOn(a, day, dayStr))

  // Count double-booked cells in the visible week (overlapping shift times).
  const weekConflicts = useMemo(() => {
    let n = 0
    for (const m of scheduledMembers) {
      for (let i = 0; i < days.length; i++) {
        if (cellHasConflict(cellFor(m.id, days[i], dayStrs[i]))) n++
      }
    }
    return n
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledMembers, days, dayStrs, byUser])

  const removeMutation = useMutation({
    mutationFn: (id: string) => rotaApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.schedules.rota(spaceId) })
      setDeleteTarget(null)
      notify.success(t("scheduling.rota.toast.deleted"))
    },
    onError: (err: Error) => notify.error(err.message || t("scheduling.rota.toast.deleteFailed")),
  })

  const recurrenceSummary = (a: ShiftAssignment): string => {
    switch (a.recurrence) {
      case ShiftRecurrence.DAILY:
        return t("scheduling.rota.recurrence.dailySummary")
      case ShiftRecurrence.WEEKLY:
        return a.daysOfWeek?.length
          ? a.daysOfWeek
              .slice()
              .sort((x, y) => x - y)
              .map((d) => t(`scheduling.rota.weekdaysShort.${WEEKDAY_KEYS[d]}`))
              .join(", ")
          : t("scheduling.rota.recurrence.weekly")
      case ShiftRecurrence.MONTHLY:
        return a.daysOfMonth?.length
          ? t("scheduling.rota.recurrence.monthlySummary", { days: a.daysOfMonth.slice().sort((x, y) => x - y).join(", ") })
          : t("scheduling.rota.recurrence.monthly")
      case ShiftRecurrence.ONE_OFF:
        return t("scheduling.rota.recurrence.oneOffSummary", { count: a.dates?.length || 0 })
      default:
        return ""
    }
  }

  return {
    t,
    dialogOpen,
    setDialogOpen,
    editTarget,
    setEditTarget,
    deleteTarget,
    setDeleteTarget,
    assignments,
    isLoading,
    setWeekStart,
    days,
    dayStrs,
    todayStr,
    scheduledMembers,
    openMembers,
    cellFor,
    weekConflicts,
    removeMutation,
    recurrenceSummary,
  }
}

/** What RotaTab and its sections read. */
export type RotaTabState = ReturnType<typeof useRotaTab>

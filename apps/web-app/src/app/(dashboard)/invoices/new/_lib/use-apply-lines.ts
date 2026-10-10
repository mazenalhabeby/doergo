"use client"

import { useRef, type Dispatch, type SetStateAction } from "react"
import type { invoicesApi } from "@/lib/api"
import type { DayRun, HourRun, WorkEntry } from "./draft-model"

type Gather = NonNullable<Awaited<ReturnType<typeof invoicesApi.gather>>>

/**
 * The WORK lines follow the data; what somebody typed does not. `applyLines`
 * rebuilds the three lists from a gather — keeping each line's include tick and
 * any hours typed over — and `linesFrom` remembers which gather they came from.
 */
export function useApplyLines({
  setEntries, setDayRuns, setHourRuns,
}: {
  setEntries: Dispatch<SetStateAction<WorkEntry[]>>
  setDayRuns: Dispatch<SetStateAction<DayRun[]>>
  setHourRuns: Dispatch<SetStateAction<HourRun[]>>
}) {
  const linesFrom = useRef<unknown>(null)

  /** `fresh`: a new source (another workspace or client) — nothing of the old lists carries over. */
  function applyLines(g: Gather, fresh = false) {
    // The server's previous hours per job — a line whose hours differ from them was typed over.
    const before = linesFrom.current as typeof g | null
    const serverHoursBefore = new Map((before?.workEntries ?? []).map((w) => [w.taskId, w.hours ?? 0]))
    linesFrom.current = g
      setEntries((prev) => {
        const was = new Map((fresh ? [] : prev).map((e) => [e.taskId, e]))
        return (g.workEntries || []).map((w) => ({
          taskId: w.taskId,
          taskTitle: w.taskTitle,
          reportId: w.reportId,
          workerName: w.workerName,
          hours: w.hours ?? 0,
          billRateCents: (w as { billRateCents?: number | null }).billRateCents ?? null,
          costRateCents: (w as { costRateCents?: number | null }).costRateCents ?? null,
          notes: w.notes,
          completedAt: w.completedAt,
          parts: w.parts || [],
          hasReport: w.hasReport,
          include: true,
          includeParts: true,
          workerId: w.workerId ?? null,
          workRoleId: w.workRoleId ?? null,
          workRoleName: w.workRoleName ?? null,
          hoursBillable: w.hoursBillable !== false,
          billBy: w.billBy ?? "HOUR",
        })).map((e) => {
          const old = was.get(e.taskId)
          if (!old) return e
          const typedOver = old.hours !== serverHoursBefore.get(e.taskId)
          return { ...e, include: old.include, includeParts: old.includeParts, hours: typedOver ? old.hours : e.hours }
        })
      })
      setDayRuns((prev) => {
        const on = new Map((fresh ? [] : prev).map((d) => [d.key, d.include]))
        return (g.dayEntries || []).map((d) => {
          const key = `${d.workerId}|${d.fromDay}`
          return { ...d, key, include: on.get(key) ?? true }
        })
      })
      setHourRuns((prev) => {
        const on = new Map((fresh ? [] : prev).map((h) => [h.key, h.include]))
        return (g.hourEntries || []).map((h) => {
          const key = `${h.workerId}|${h.fromDay}`
          return { ...h, key, include: on.get(key) ?? true }
        })
      })
  }

  return { linesFrom, applyLines }
}

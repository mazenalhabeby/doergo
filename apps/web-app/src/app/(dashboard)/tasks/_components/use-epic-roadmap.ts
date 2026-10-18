"use client"

import { useMemo, useRef, useState, useCallback, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { startOfDay, addDays, diffDays } from "@/lib/local-days"
import type { Task, Epic } from "@/lib/api"
import { formatMonthYear } from "@/lib/format-date"

export const DAY_WIDTH = 16

const DONE_STATUSES = ["COMPLETED", "CLOSED"]

// ─── Helpers ───────────────────────────────────────────────────────────────

// ─── Types ─────────────────────────────────────────────────────────────────

export interface EpicRoadmapProps {
  epics: Epic[]
  tasks: Task[]
  activeEpicId?: string | null
  onEpicClick?: (epicId: string | null) => void
}

interface EpicRow {
  epic: Epic
  totalTasks: number
  completedTasks: number
  inProgressTasks: number
  progressPct: number
  hasDateRange: boolean
  startDate: Date | null
  endDate: Date | null
}

/** EpicRoadmap's state and handlers — everything before its markup, moved here unchanged. */
export function useEpicRoadmap(
  { epics, tasks, activeEpicId, onEpicClick }: Pick<EpicRoadmapProps, 'epics' | 'tasks' | 'activeEpicId' | 'onEpicClick'>) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hoveredEpicId, setHoveredEpicId] = useState<string | null>(null)

  // Build epic rows with progress data
  const epicRows: EpicRow[] = useMemo(() => {
    return epics.map((epic) => {
      const epicTasks = tasks.filter((t) => t.epicId === epic.id)
      const totalTasks = epicTasks.length
      const completedTasks = epicTasks.filter((t) => DONE_STATUSES.includes(t.status)).length
      const inProgressTasks = epicTasks.filter((t) => t.status === "IN_PROGRESS").length
      const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

      const startDate = epic.startDate ? startOfDay(new Date(epic.startDate)) : null
      const endDate = epic.targetDate ? startOfDay(new Date(epic.targetDate)) : null
      const hasDateRange = !!(startDate || endDate)

      return { epic, totalTasks, completedTasks, inProgressTasks, progressPct, hasDateRange, startDate, endDate }
    })
  }, [epics, tasks])

  // Compute timeline range dynamically from epic dates
  const today = useMemo(() => startOfDay(new Date()), [])

  const { rangeStart, totalDays, months } = useMemo(() => {
    let earliest = today
    let latest = today

    for (const row of epicRows) {
      if (row.startDate && row.startDate < earliest) earliest = row.startDate
      if (row.endDate && row.endDate > latest) latest = row.endDate
    }

    const rs = startOfDay(new Date(earliest))
    rs.setDate(1)

    const re = startOfDay(new Date(latest))
    re.setMonth(re.getMonth() + 2)
    re.setDate(1)

    // Min 3 months
    const minEnd = new Date(rs)
    minEnd.setMonth(minEnd.getMonth() + 3)
    if (re < minEnd) re.setTime(minEnd.getTime())

    const td = diffDays(re, rs)
    const ms: { label: string; offsetDays: number; widthDays: number }[] = []
    const cursor = new Date(rs)
    while (cursor < re) {
      const monthStart = new Date(cursor)
      cursor.setMonth(cursor.getMonth() + 1)
      const monthEnd = cursor < re ? cursor : re
      ms.push({
        label: formatMonthYear(monthStart, false),
        offsetDays: diffDays(monthStart, rs),
        widthDays: diffDays(new Date(monthEnd), monthStart),
      })
    }

    return { rangeStart: rs, rangeEnd: re, totalDays: td, months: ms }
  }, [today, epicRows])

  const totalWidth = totalDays * DAY_WIDTH
  const todayOffset = diffDays(today, rangeStart)

  // Scroll to today on mount
  useEffect(() => {
    if (scrollRef.current) {
      const scrollTarget = todayOffset * DAY_WIDTH - scrollRef.current.clientWidth / 3
      scrollRef.current.scrollLeft = Math.max(0, scrollTarget)
    }
  }, [todayOffset])

  const getBarPosition = useCallback(
    (start: Date | null, end: Date | null) => {
      const effectiveStart = start || today
      const effectiveEnd = end || addDays(effectiveStart, 14)
      const startOff = diffDays(effectiveStart, rangeStart)
      const endOff = diffDays(effectiveEnd, rangeStart)
      const cs = Math.max(0, startOff)
      const ce = Math.min(totalDays, endOff)
      if (ce <= cs) return null
      return { left: cs * DAY_WIDTH, width: (ce - cs) * DAY_WIDTH }
    },
    [rangeStart, totalDays, today],
  )

  const handleEpicClick = useCallback((epicId: string) => {
    // Toggle: click same epic to deselect
    onEpicClick?.(activeEpicId === epicId ? null : epicId)
  }, [activeEpicId, onEpicClick])

  return {
    t,
    scrollRef,
    hoveredEpicId,
    setHoveredEpicId,
    epicRows,
    months,
    totalWidth,
    todayOffset,
    getBarPosition,
    handleEpicClick,
  }
}

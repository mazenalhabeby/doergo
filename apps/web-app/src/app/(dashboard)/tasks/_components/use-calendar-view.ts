"use client"

import { useMemo, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { startOfDay } from "@/lib/local-days"
import { useStepConfigs } from "@/hooks/use-step-config"
import type { Task } from "@/lib/api"
import { dateLocale } from "@/lib/format-date"

// ─── Helpers ────────────────────────────────────────────────────────────────

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  const startDate = new Date(firstDay)
  startDate.setDate(startDate.getDate() - startDate.getDay()) // Start from Sunday

  const days: Date[] = []
  const current = new Date(startDate)
  // Always show 6 weeks for consistent height
  for (let i = 0; i < 42; i++) {
    days.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return days
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MultiDayBar {
  task: Task
  startDay: Date
  endDay: Date
  color: string
  colorHex: string
}

export interface CalendarViewProps {
  tasks: Task[]
}

/** CalendarView's state and handlers — everything before its markup, moved here unchanged. */
export function useCalendarView({ tasks }: Pick<CalendarViewProps, 'tasks'>) {
  const { t } = useTranslation()
  const stepOf = useStepConfigs(tasks)
  const today = startOfDay(new Date())
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [tooltip, setTooltip] = useState<{ task: Task; x: number; y: number } | null>(null)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const goToPrev = useCallback(() => {
    setViewDate(new Date(year, month - 1, 1))
  }, [year, month])

  const goToNext = useCallback(() => {
    setViewDate(new Date(year, month + 1, 1))
  }, [year, month])

  const goToToday = useCallback(() => {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))
  }, [today])

  const handleTooltipShow = useCallback((task: Task, x: number, y: number) => {
    setTooltip({ task, x, y })
  }, [])

  const handleTooltipHide = useCallback(() => {
    setTooltip(null)
  }, [])

  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month])

  // ─── Map tasks to days ───
  const dayTaskMap = useMemo(() => {
    const map = new Map<string, Task[]>()

    for (const task of tasks) {
      // Place at dueDate (single-day pill)
      if (task.dueDate && !task.startDate) {
        const key = startOfDay(new Date(task.dueDate)).toISOString()
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(task)
      }
      // If task has startDate but no dueDate, place at startDate
      if (task.startDate && !task.dueDate) {
        const key = startOfDay(new Date(task.startDate)).toISOString()
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(task)
      }
    }

    return map
  }, [tasks])

  // ─── Multi-day bars ───
  const multiDayBars: MultiDayBar[] = useMemo(() => {
    return tasks
      .filter((t) => t.startDate && t.dueDate)
      .map((task) => {
        const statusConfig = stepOf(task)
        return {
          task,
          startDay: startOfDay(new Date(task.startDate!)),
          endDay: startOfDay(new Date(task.dueDate!)),
          color: statusConfig.hex,
          colorHex: statusConfig.hex,
        }
      })
  }, [tasks, stepOf])

  // ─── Build rows of multi-day bars per week ───
  const weekMultiDayRows = useMemo(() => {
    const weeks: MultiDayBar[][][] = []

    for (let w = 0; w < 6; w++) {
      const weekStart = calendarDays[w * 7]!
      const weekEnd = calendarDays[w * 7 + 6]!
      const rows: MultiDayBar[][] = []

      // Find bars that overlap this week
      const overlapping = multiDayBars.filter(
        (bar) => bar.startDay <= weekEnd && bar.endDay >= weekStart
      )

      for (const bar of overlapping) {
        // Find a row that has no conflict
        let placed = false
        for (const row of rows) {
          const conflict = row.some(
            (existing) =>
              existing.startDay <= bar.endDay && existing.endDay >= bar.startDay
          )
          if (!conflict) {
            row.push(bar)
            placed = true
            break
          }
        }
        if (!placed) {
          rows.push([bar])
        }
      }

      weeks.push(rows)
    }

    return weeks
  }, [calendarDays, multiDayBars])

  // ─── Max multi-day rows to reserve space ───
  const maxMultiDayRows = useMemo(() => {
    return Math.max(0, ...weekMultiDayRows.map((w) => w.length))
  }, [weekMultiDayRows])

  const multiDayAreaHeight = maxMultiDayRows * 28 + 8

  const monthLabel = viewDate.toLocaleDateString(dateLocale(), { month: "long", year: "numeric" })
  const isCurrentMonth = isSameMonth(today, viewDate)

  return {
    t,
    stepOf,
    today,
    viewDate,
    tooltip,
    goToPrev,
    goToNext,
    goToToday,
    handleTooltipShow,
    handleTooltipHide,
    calendarDays,
    dayTaskMap,
    weekMultiDayRows,
    multiDayAreaHeight,
    monthLabel,
    isCurrentMonth,
  }
}

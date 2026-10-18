"use client"

import React, { useMemo, useRef, useEffect, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { startOfDay, addDays, diffDays } from "@/lib/local-days"
import { useStepConfigs } from "@/hooks/use-step-config"
import type { Task, Phase } from "@/lib/api"
import { formatMonthYear } from "@/lib/format-date"

export type TimeScale = "day" | "week" | "month"

function getMonthLabel(d: Date): string {
  return formatMonthYear(d)
}

export const ROW_HEIGHT = 36

const MIN_COL_WIDTH_DAY = 120

const MIN_COL_WIDTH_WEEK = 44

const MIN_COL_WIDTH_MONTH = 14

// ─── Types ──────────────────────────────────────────────────────────────────

interface TimelineGroup {
  label: string
  color?: string
  tasks: Task[]
}

export interface TimelineViewProps {
  tasks: Task[]
  phases?: Phase[]
}

/** TimelineView's state and handlers — everything before its markup, moved here unchanged. */
export function useTimelineView({ tasks, phases }: Pick<TimelineViewProps, "tasks" | "phases">) {
  const { t } = useTranslation()
  const stepOf = useStepConfigs(tasks)
  const [scale, setScale] = useState<TimeScale>("week")
  const timelineRef = useRef<HTMLDivElement>(null)
  const leftPanelRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ task: Task; x: number; y: number } | null>(null)

  // ─── Group tasks by phase ───
  const groups: TimelineGroup[] = useMemo(() => {
    const phaseMap = new Map<string, Phase>()
    if (phases) phases.forEach((p) => phaseMap.set(p.id, p))

    const grouped = new Map<string | null, Task[]>()
    for (const task of tasks) {
      const key = task.phaseId || null
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(task)
    }

    const result: TimelineGroup[] = []

    // Phase groups first
    for (const [phaseId, phaseTasks] of grouped) {
      if (phaseId && phaseMap.has(phaseId)) {
        const phase = phaseMap.get(phaseId)!
        result.push({ label: phase.name, color: phase.color, tasks: phaseTasks })
      }
    }

    // Ungrouped tasks
    const ungrouped = grouped.get(null)
    if (ungrouped && ungrouped.length > 0) {
      result.push({ label: t("tasks.sidebar.noPhase"), tasks: ungrouped })
    }

    // If no phases exist at all, put everything in one flat list
    if (result.length === 0) {
      result.push({ label: t("tasks.statusTabs.all"), tasks })
    }

    return result
  }, [tasks, phases, t])

  // ─── Date range ───
  const { rangeStart, rangeEnd, columns, colWidth } = useMemo(() => {
    const today = startOfDay(new Date())
    let earliest = today
    let latest = today

    for (const task of tasks) {
      if (task.startDate) {
        const d = startOfDay(new Date(task.startDate))
        if (d < earliest) earliest = d
      }
      if (task.dueDate) {
        const d = startOfDay(new Date(task.dueDate))
        if (d > latest) latest = d
        if (!task.startDate && d < earliest) earliest = d
      }
    }

    // Add padding
    const padDays = scale === "month" ? 30 : scale === "week" ? 7 : 3
    const rStart = addDays(earliest, -padDays)
    const rEnd = addDays(latest, padDays)
    const totalDays = diffDays(rEnd, rStart) + 1

    const cols: Date[] = []
    for (let i = 0; i < totalDays; i++) {
      cols.push(addDays(rStart, i))
    }

    const cw = scale === "day" ? MIN_COL_WIDTH_DAY : scale === "week" ? MIN_COL_WIDTH_WEEK : MIN_COL_WIDTH_MONTH

    return { rangeStart: rStart, rangeEnd: rEnd, columns: cols, colWidth: cw }
  }, [tasks, scale])

  // ─── Total rows (header rows + task rows) ───
  const totalRows = useMemo(() => {
    let count = 0
    for (const group of groups) {
      count++ // group header
      count += group.tasks.length // tasks
    }
    return count
  }, [groups])

  // ─── Auto-scroll to today ───
  useEffect(() => {
    if (!timelineRef.current) return
    const today = startOfDay(new Date())
    const dayOffset = diffDays(today, rangeStart)
    const px = dayOffset * colWidth - timelineRef.current.clientWidth / 2
    timelineRef.current.scrollLeft = Math.max(0, px)
  }, [rangeStart, colWidth])

  // ─── Sync vertical scroll ───
  const handleTimelineScroll = useCallback(() => {
    if (timelineRef.current && leftPanelRef.current) {
      leftPanelRef.current.scrollTop = timelineRef.current.scrollTop
    }
  }, [])

  // ─── Month header groups ───
  const monthHeaders = useMemo(() => {
    const months: { label: string; startIdx: number; span: number }[] = []
    let current = ""
    let startIdx = 0
    for (let i = 0; i < columns.length; i++) {
      const label = getMonthLabel(columns[i]!)
      if (label !== current) {
        if (current) {
          months.push({ label: current, startIdx, span: i - startIdx })
        }
        current = label
        startIdx = i
      }
    }
    if (current) {
      months.push({ label: current, startIdx, span: columns.length - startIdx })
    }
    return months
  }, [columns])

  // ─── Bar position calculator ───
  const getBarStyle = useCallback(
    (task: Task): React.CSSProperties | null => {
      const start = task.startDate ? startOfDay(new Date(task.startDate)) : null
      const end = task.dueDate ? startOfDay(new Date(task.dueDate)) : null

      if (!start && !end) return null

      if (start && end) {
        const leftOffset = diffDays(start, rangeStart) * colWidth
        const duration = diffDays(end, start) + 1
        const width = Math.max(duration * colWidth, colWidth)
        return { left: leftOffset, width, position: "absolute" as const, top: 5, height: ROW_HEIGHT - 10 }
      }

      // Milestone: only dueDate, no startDate
      if (end) {
        const leftOffset = diffDays(end, rangeStart) * colWidth + colWidth / 2
        return { left: leftOffset, position: "absolute" as const, top: 4, transform: "translateX(-50%)" }
      }

      return null
    },
    [rangeStart, colWidth],
  )

  // ─── Dependency arrows ───
  const dependencyLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; key: string }[] = []

    // Build a task index map (row index in the flattened list)
    const taskRowMap = new Map<string, number>()
    let rowIdx = 0
    for (const group of groups) {
      rowIdx++ // group header row
      for (const task of group.tasks) {
        taskRowMap.set(task.id, rowIdx)
        rowIdx++
      }
    }

    for (const group of groups) {
      for (const task of group.tasks) {
        if (!task.successors) continue
        for (const dep of task.successors) {
          const predRow = taskRowMap.get(task.id)
          const succRow = taskRowMap.get(dep.successorId)
          if (predRow == null || succRow == null) continue

          // Predecessor end
          const predEnd = task.dueDate
            ? startOfDay(new Date(task.dueDate))
            : task.startDate
              ? startOfDay(new Date(task.startDate))
              : null
          if (!predEnd) continue

          // Successor start
          const succTask = tasks.find((t) => t.id === dep.successorId)
          if (!succTask) continue
          const succStart = succTask.startDate
            ? startOfDay(new Date(succTask.startDate))
            : succTask.dueDate
              ? startOfDay(new Date(succTask.dueDate))
              : null
          if (!succStart) continue

          const x1 = (diffDays(predEnd, rangeStart) + 1) * colWidth
          const y1 = predRow * ROW_HEIGHT + ROW_HEIGHT / 2
          const x2 = diffDays(succStart, rangeStart) * colWidth
          const y2 = succRow * ROW_HEIGHT + ROW_HEIGHT / 2

          lines.push({ x1, y1, x2, y2, key: `${task.id}-${dep.successorId}` })
        }
      }
    }

    return lines
  }, [groups, tasks, rangeStart, colWidth])

  const todayOffset = useMemo(() => {
    const today = startOfDay(new Date())
    return diffDays(today, rangeStart) * colWidth + colWidth / 2
  }, [rangeStart, colWidth])

  const timelineWidth = columns.length * colWidth

  return {
    t,
    stepOf,
    scale,
    setScale,
    timelineRef,
    leftPanelRef,
    tooltip,
    setTooltip,
    groups,
    columns,
    colWidth,
    totalRows,
    handleTimelineScroll,
    monthHeaders,
    getBarStyle,
    dependencyLines,
    todayOffset,
    timelineWidth,
  }
}

/** What TimelineView and its sections read. */
export type TimelineViewState = ReturnType<typeof useTimelineView>

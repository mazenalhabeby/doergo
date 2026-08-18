"use client"

import React, { useMemo, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import ReactDOM from "react-dom"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { getStatusConfig } from "@/lib/constants"
import type { Task } from "@/lib/api"
import { Button } from "@/components/ui/button"

const APPLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MAX_VISIBLE_PILLS = 3

// ─── Helpers ────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

function getCalendarDays(year: number, month: number): Date[] {
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

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface MultiDayBar {
  task: Task
  startDay: Date
  endDay: Date
  color: string
  colorHex: string
}

interface CalendarViewProps {
  tasks: Task[]
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

const PillTooltip = React.memo(function PillTooltip({
  task,
  style,
}: {
  task: Task
  style: React.CSSProperties
}) {
  const statusConfig = getStatusConfig(task.status)
  return (
    <div
      className="fixed z-[100] pointer-events-none px-3 py-2.5 bg-popover border border-border rounded-xl shadow-xl min-w-[180px] max-w-[260px]"
      style={{ ...style, animation: `fadeSlideIn 0.15s ${APPLE_EASE} both` }}
    >
      <p className="text-sm font-semibold text-foreground line-clamp-2 mb-1">{task.title}</p>
      <div className="flex items-center gap-2 mb-1">
        <span
          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ backgroundColor: `${statusConfig.hex}20`, color: statusConfig.hex }}
        >
          {statusConfig.label}
        </span>
        <span className="text-[10px] text-muted-foreground font-medium uppercase">{task.priority}</span>
      </div>
      {task.assignedTo && (
        <p className="text-[11px] text-muted-foreground">
          {task.assignedTo.firstName} {task.assignedTo.lastName}
        </p>
      )}
    </div>
  )
})

// ─── Calendar Cell (memoized) ──────────────────────────────────────────────

interface CalendarCellProps {
  day: Date
  dayInWeek: number
  isCurrentMonth: boolean
  isToday: boolean
  isWeekendDay: boolean
  dayTasks: Task[]
  weekBars: MultiDayBar[][]
  multiDayAreaHeight: number
  calendarDays: Date[]
  weekIdx: number
  idx: number
  onTooltipShow: (task: Task, x: number, y: number) => void
  onTooltipHide: () => void
}

const CalendarCell = React.memo(function CalendarCell({
  day,
  dayInWeek,
  isCurrentMonth,
  isToday,
  isWeekendDay,
  dayTasks,
  weekBars,
  multiDayAreaHeight,
  calendarDays,
  weekIdx,
  idx,
  onTooltipShow,
  onTooltipHide,
}: CalendarCellProps) {
  return (
    <div
      className={cn(
        "relative border-b border-r border-border/20 min-h-[90px] p-1 transition-colors duration-100",
        !isCurrentMonth && "opacity-40",
        isWeekendDay && isCurrentMonth && "bg-muted/15",
        isToday && "bg-blue-500/[0.04]",
        dayInWeek === 6 && "border-r-0"
      )}
      style={{
        animation: `fadeSlideIn 0.2s ${APPLE_EASE} ${idx * 6}ms both`,
      }}
    >
      {/* Day number */}
      <div className="flex justify-end mb-0.5">
        <span
          className={cn(
            "size-6 flex items-center justify-center rounded-full text-xs",
            isToday
              ? "bg-blue-600 text-white font-bold shadow-sm"
              : isCurrentMonth
                ? "text-foreground/70 font-medium"
                : "text-muted-foreground/30"
          )}
        >
          {day.getDate()}
        </span>
      </div>

      {/* Multi-day bars are now rendered in a separate row above the week cells */}

      {/* Single-day task pills */}
      <div
        className="space-y-0.5"
        style={{ marginTop: dayInWeek === 0 ? multiDayAreaHeight : weekBars.length > 0 ? multiDayAreaHeight : 0 }}
      >
        {dayTasks.slice(0, MAX_VISIBLE_PILLS).map((task) => {
          const statusConfig = getStatusConfig(task.status)
          return (
            <Link
              key={task.id}
              href={`/tasks/${task.id}`}
              className={cn(
                "block h-5 px-1.5 py-0.5 rounded text-[10px] font-semibold truncate leading-[16px]",
                "hover:brightness-95 transition-all duration-100 cursor-pointer"
              )}
              style={{
                backgroundColor: `${statusConfig.hex}15`,
                color: statusConfig.hex,
                borderLeft: `2.5px solid ${statusConfig.hex}`,
              }}
              onMouseMove={(e) => onTooltipShow(task, e.clientX + 12, e.clientY + 16)}
              onMouseLeave={onTooltipHide}
            >
              {task.title}
            </Link>
          )
        })}
        {dayTasks.length > MAX_VISIBLE_PILLS && (
          <span className="text-[10px] text-muted-foreground px-1.5 font-semibold cursor-default">
            +{dayTasks.length - MAX_VISIBLE_PILLS} more
          </span>
        )}
      </div>
    </div>
  )
})

// ─── Component ──────────────────────────────────────────────────────────────

export function CalendarView({ tasks }: CalendarViewProps) {
  const { t } = useTranslation()
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
        const statusConfig = getStatusConfig(task.status)
        return {
          task,
          startDay: startOfDay(new Date(task.startDate!)),
          endDay: startOfDay(new Date(task.dueDate!)),
          color: statusConfig.hex,
          colorHex: statusConfig.hex,
        }
      })
  }, [tasks])

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

  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  const isCurrentMonth = isSameMonth(today, viewDate)

  return (
    <div
      className="bg-card rounded-xl border border-border/50 overflow-hidden shadow-sm"
      style={{ animation: `fadeSlideIn 0.3s ${APPLE_EASE} both` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-lg"
            onClick={goToPrev}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={goToToday}
            className={cn(
              "h-7 px-3 text-xs font-medium rounded-lg transition-colors",
              isCurrentMonth
                ? "text-muted-foreground/50 cursor-default"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
            disabled={isCurrentMonth}
          >
            {t("tasks.menu.today")}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-lg"
            onClick={goToNext}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border/40 bg-muted/10">
        {WEEKDAYS.map((day, i) => (
          <div
            key={day}
            className={cn(
              "py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider",
              i === 0 || i === 6 ? "text-muted-foreground/40" : "text-muted-foreground/70"
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid — week by week with multi-day bar rows */}
      {Array.from({ length: 6 }).map((_, weekIdx) => {
        const weekDays = calendarDays.slice(weekIdx * 7, weekIdx * 7 + 7)
        const weekBars = weekMultiDayRows[weekIdx] || []
        const weekStart = weekDays[0]!

        return (
          <div key={weekIdx}>
            {/* Multi-day bars spanning full width */}
            {weekBars.length > 0 && (
              <div className="relative border-b border-border/10 bg-muted/5" style={{ height: weekBars.length * 28 + 8 }}>
                {weekBars.map((row, rowIdx) =>
                  row.map((bar) => {
                    const visStart = bar.startDay < weekStart ? weekStart : bar.startDay
                    const visEnd = bar.endDay > weekDays[6]! ? weekDays[6]! : bar.endDay

                    const startCol = Math.max(0, diffDays(visStart, weekStart))
                    const endCol = Math.min(6, diffDays(visEnd, weekStart))
                    const span = endCol - startCol + 1

                    const isRealStart = isSameDay(visStart, bar.startDay)
                    const isRealEnd = isSameDay(visEnd, bar.endDay)

                    return (
                      <Link
                        key={`${bar.task.id}-w${weekIdx}`}
                        href={`/tasks/${bar.task.id}`}
                        className={cn(
                          "absolute h-6 flex items-center px-2 text-[11px] font-bold text-white truncate shadow-sm",
                          "hover:brightness-110 hover:shadow-md transition-all duration-150 cursor-pointer",
                          isRealStart && isRealEnd ? "rounded-md" : isRealStart ? "rounded-l-md" : isRealEnd ? "rounded-r-md" : ""
                        )}
                        style={{
                          left: `calc(${(startCol / 7) * 100}% + 2px)`,
                          width: `calc(${(span / 7) * 100}% - 4px)`,
                          top: rowIdx * 28 + 4,
                          backgroundColor: bar.colorHex,
                        }}
                        onMouseMove={(e) => handleTooltipShow(bar.task, e.clientX + 12, e.clientY + 16)}
                        onMouseLeave={handleTooltipHide}
                      >
                        {span >= 2 ? bar.task.title : bar.task.title.slice(0, 6)}
                      </Link>
                    )
                  })
                )}
              </div>
            )}

            {/* Day cells for this week */}
            <div className="grid grid-cols-7">
              {weekDays.map((day, dayInWeek) => {
                const idx = weekIdx * 7 + dayInWeek
                const isCurrentMo = isSameMonth(day, viewDate)
                const isTodayDay = isSameDay(day, today)
                const dayKey = startOfDay(day).toISOString()
                const dayTasks = dayTaskMap.get(dayKey) || []

                return (
                  <CalendarCell
                    key={idx}
                    day={day}
                    dayInWeek={dayInWeek}
                    isCurrentMonth={isCurrentMo}
                    isToday={isTodayDay}
                    isWeekendDay={isWeekend(day)}
                    dayTasks={dayTasks}
                    weekBars={[]}
                    multiDayAreaHeight={0}
                    calendarDays={calendarDays}
                    weekIdx={weekIdx}
                    idx={idx}
                    onTooltipShow={handleTooltipShow}
                    onTooltipHide={handleTooltipHide}
                  />
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Tooltip — rendered via portal to avoid stacking context issues */}
      {tooltip && typeof document !== 'undefined' && ReactDOM.createPortal(
        <PillTooltip
          task={tooltip.task}
          style={{ left: tooltip.x, top: tooltip.y }}
        />,
        document.body
      )}
    </div>
  )
}

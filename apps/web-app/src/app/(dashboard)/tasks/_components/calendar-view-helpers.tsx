"use client"

import { personName } from "@hbcfield/shared/client"
import React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { StatusConfig } from "@/lib/constants"
import type { Task } from "@/lib/api"
import { type MultiDayBar } from "./use-calendar-view"

/** CalendarView's module-level helpers, moved here unchanged so its sections can read them too. */
export const APPLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const MAX_VISIBLE_PILLS = 3

// ─── Tooltip ────────────────────────────────────────────────────────────────

export const PillTooltip = React.memo(function PillTooltip({
  task,
  statusConfig,
  style,
}: {
  task: Task
  /** The step's look from the task's own flow — see useStepConfigs. */
  statusConfig: StatusConfig
  style: React.CSSProperties
}) {
  return (
    <div
      className={"fixed z-[100] pointer-events-none px-3 py-2.5 bg-popover border " +
        "border-border rounded-xl shadow-xl min-w-[180px] max-w-[260px]"}
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
          {personName(task.assignedTo)}
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
  /** A step's name and colour, from the task's own flow. */
  stepOf: (task: Task) => StatusConfig
}

export const CalendarCell = React.memo(function CalendarCell({
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
  stepOf,
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
          const statusConfig = stepOf(task)
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

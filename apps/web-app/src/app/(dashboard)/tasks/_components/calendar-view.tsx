"use client"

import { personName } from "@hbcfield/shared/client"
import React, { useMemo, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import ReactDOM from "react-dom"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { startOfDay, diffDays, isSameDay, isWeekend } from "@/lib/local-days"
import type { StatusConfig } from "@/lib/constants"
import { useStepConfigs } from "@/hooks/use-step-config"
import type { Task } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { dateLocale } from "@/lib/format-date"
import { useCalendarView, type MultiDayBar, isSameMonth, type CalendarViewProps } from "./use-calendar-view"
import { APPLE_EASE, WEEKDAYS, PillTooltip, CalendarCell } from "./calendar-view-helpers"

// ─── Component ──────────────────────────────────────────────────────────────

export function CalendarView({ tasks }: CalendarViewProps) {
  const {
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
  } = useCalendarView({ tasks })

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
                    stepOf={stepOf}
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
          statusConfig={stepOf(tooltip.task)}
          style={{ left: tooltip.x, top: tooltip.y }}
        />,
        document.body
      )}
    </div>
  )
}

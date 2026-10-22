"use client"

import React from "react"
import { useTranslation } from "react-i18next"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { startOfDay, isSameDay, isWeekend } from "@/lib/local-days"
import type { StatusConfig } from "@/lib/constants"
import type { Task } from "@/lib/api"
import { APPLE_EASE, formatHeaderDate, HEADER_HEIGHT, ROW_HEIGHT, type TimeScale } from "./timeline-layout"
import type { TimelineGroup, TimelineTooltip } from "./use-timeline-view"

interface TimelineChartProps {
  timelineRef: React.RefObject<HTMLDivElement | null>
  onScroll: () => void
  monthHeaders: { label: string; startIdx: number; span: number }[]
  columns: Date[]
  colWidth: number
  scale: TimeScale
  timelineWidth: number
  totalRows: number
  todayOffset: number
  groups: TimelineGroup[]
  getBarStyle: (task: Task) => React.CSSProperties | null
  stepOf: (task: Task) => StatusConfig
  setTooltip: React.Dispatch<React.SetStateAction<TimelineTooltip | null>>
  dependencyLines: { x1: number; y1: number; x2: number; y2: number; key: string }[]
}

/** The timeline's scrollable right panel: month/day header, grid, today line, a bar or milestone per task, dependency arrows. */
export function TimelineChart({
  timelineRef,
  onScroll,
  monthHeaders,
  columns,
  colWidth,
  scale,
  timelineWidth,
  totalRows,
  todayOffset,
  groups,
  getBarStyle,
  stepOf,
  setTooltip,
  dependencyLines,
}: TimelineChartProps) {
  const { t } = useTranslation()
  return (
    <div ref={timelineRef} className="flex-1 overflow-auto" onScroll={onScroll} style={{ scrollBehavior: "smooth" }}>
      {/* Time header */}
      <div
        className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm border-b border-border/40"
        style={{ height: HEADER_HEIGHT }}
      >
        {/* Month row */}
        <div className="flex" style={{ height: HEADER_HEIGHT / 2 }}>
          {monthHeaders.map((mh) => (
            <div
              key={`${mh.label}-${mh.startIdx}`}
              className="flex items-center justify-center text-[11px] font-semibold text-foreground/50 border-r border-border/10"
              style={{ width: mh.span * colWidth, minWidth: mh.span * colWidth }}
            >
              {mh.label}
            </div>
          ))}
        </div>

        {/* Day row */}
        <div className="flex" style={{ height: HEADER_HEIGHT / 2 }}>
          {columns.map((col, ci) => {
            const today = startOfDay(new Date())
            const isToday = isSameDay(col, today)
            return (
              <div
                key={ci}
                className={cn(
                  "flex items-center justify-center text-[10px] border-r border-border/10",
                  isToday
                    ? "font-bold text-blue-600 bg-blue-500/5"
                    : isWeekend(col)
                      ? "text-muted-foreground/30 bg-muted/10"
                      : "text-muted-foreground/50",
                )}
                style={{ width: colWidth, minWidth: colWidth }}
              >
                {scale !== "month" ? formatHeaderDate(col, scale) : col.getDate()}
              </div>
            )
          })}
        </div>
      </div>

      {/* Grid + Bars */}
      <div className="relative" style={{ width: timelineWidth, minHeight: totalRows * ROW_HEIGHT }}>
        {/* Vertical grid lines + weekend shading */}
        {columns.map((col, ci) => {
          const isWk = isWeekend(col)
          return (
            <div
              key={ci}
              className={cn(
                "absolute top-0 bottom-0 border-r",
                isWk ? "bg-muted/25 border-border/8" : "border-border/8",
              )}
              style={{ left: ci * colWidth, width: colWidth }}
            />
          )
        })}

        {/* Today line */}
        <div className="absolute top-0 bottom-0 z-10 pointer-events-none" style={{ left: todayOffset, width: 0 }}>
          {/* "Today" label */}
          <div className="absolute -top-[3px] -translate-x-1/2 whitespace-nowrap">
            <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider bg-card px-1 rounded">
              {t("common.today")}
            </span>
          </div>
          <div className="absolute top-3 bottom-0 w-px bg-red-400/70" style={{ left: 0 }} />
          <div className="absolute top-3 -left-[4px] size-[8px] rounded-full bg-red-500 ring-2 ring-card" />
        </div>

        {/* Horizontal rows */}
        {(() => {
          const rows: React.ReactNode[] = []
          let currentRow = 0

          for (const group of groups) {
            // Group header row
            rows.push(
              <div
                key={`gh-${group.label}`}
                className="absolute left-0 right-0 bg-muted/20 border-b border-border/10"
                style={{ top: currentRow * ROW_HEIGHT, height: ROW_HEIGHT, width: timelineWidth }}
              />,
            )
            currentRow++

            // Task bars
            for (const task of group.tasks) {
              const barStyle = getBarStyle(task)
              // The step's own colour — a custom step is not a grey bar.
              const barHex = stepOf(task).hex
              const isMilestone = !task.startDate && task.dueDate
              const rowTop = currentRow * ROW_HEIGHT

              rows.push(
                <div
                  key={task.id}
                  className="absolute left-0 border-b border-border/5"
                  style={{ top: rowTop, height: ROW_HEIGHT, width: timelineWidth }}
                >
                  {barStyle && !isMilestone && (
                    <div
                      className={cn(
                        "absolute rounded-lg border cursor-pointer shadow-sm",
                        "hover:brightness-110 hover:shadow-md hover:scale-y-110 transition-all duration-150",
                      )}
                      style={{
                        ...barStyle,
                        backgroundColor: `${barHex}cc`,
                        borderColor: `${barHex}4d`,
                        animation: `fadeSlideIn 0.4s ${APPLE_EASE} ${currentRow * 20}ms both`,
                      }}
                      onMouseEnter={(e) => setTooltip({ task, x: e.clientX + 12, y: e.clientY + 16 })}
                      onMouseMove={(e) =>
                        setTooltip((prev) => (prev ? { ...prev, x: e.clientX + 12, y: e.clientY + 16 } : null))
                      }
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <Link
                        href={`/tasks/${task.id}`}
                        className={cn("h-full px-2 flex items-center overflow-hidden", "text-white")}
                      >
                        <span className="text-[11px] font-medium truncate leading-none">
                          {(barStyle.width as number) > 70 ? task.title : ""}
                        </span>
                      </Link>
                    </div>
                  )}

                  {barStyle && isMilestone && (
                    <div
                      className="absolute cursor-pointer"
                      style={{
                        ...barStyle,
                        animation: `fadeSlideIn 0.4s ${APPLE_EASE} ${currentRow * 20}ms both`,
                      }}
                      onMouseEnter={(e) => setTooltip({ task, x: e.clientX + 12, y: e.clientY + 16 })}
                      onMouseMove={(e) =>
                        setTooltip((prev) => (prev ? { ...prev, x: e.clientX + 12, y: e.clientY + 16 } : null))
                      }
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <Link href={`/tasks/${task.id}`}>
                        <svg
                          className="size-6 drop-shadow-sm"
                          viewBox="0 0 24 24"
                          fill={barHex}
                          stroke={barHex}
                          strokeWidth="1"
                        >
                          <path d="M12 2 L22 12 L12 22 L2 12 Z" />
                        </svg>
                      </Link>
                    </div>
                  )}
                </div>,
              )
              currentRow++
            }
          }

          return rows
        })()}

        {/* Dependency arrows (SVG overlay) */}
        {dependencyLines.length > 0 && (
          <svg
            className="absolute inset-0 z-[5] pointer-events-none"
            style={{ width: timelineWidth, height: totalRows * ROW_HEIGHT }}
          >
            <defs>
              <marker id="arrowhead" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">
                <polygon points="0 0, 7 2.5, 0 5" className="fill-muted-foreground/50" />
              </marker>
            </defs>
            {dependencyLines.map((line) => {
              const midX = (line.x1 + line.x2) / 2
              return (
                <path
                  key={line.key}
                  d={`M ${line.x1} ${line.y1} C ${midX} ${line.y1}, ${midX} ${line.y2}, ${line.x2} ${line.y2}`}
                  fill="none"
                  className="stroke-muted-foreground/40"
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                  markerEnd="url(#arrowhead)"
                />
              )
            })}
          </svg>
        )}
      </div>
    </div>
  )
}

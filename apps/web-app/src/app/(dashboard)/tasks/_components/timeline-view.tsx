"use client"

import React, { useMemo, useRef, useEffect, useState, useCallback } from "react"
import { isTaskOverdue } from "@hbcfield/shared/client"
import ReactDOM from "react-dom"
import { useTranslation } from "react-i18next"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/user-avatar"
import { getStatusConfig } from "@/lib/constants"
import type { Task, Phase } from "@/lib/api"
import { dateLocale } from "@/lib/format-date"

const APPLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

type TimeScale = "day" | "week" | "month"

// ─── Helpers ────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

function formatHeaderDate(d: Date, scale: TimeScale): string {
  if (scale === "day") {
    return d.toLocaleDateString(dateLocale(), { weekday: "short", month: "short", day: "numeric" })
  }
  if (scale === "week") {
    return d.toLocaleDateString(dateLocale(), { month: "short", day: "numeric" })
  }
  // month
  return d.toLocaleDateString(dateLocale(), { month: "short", year: "numeric" })
}

function getMonthLabel(d: Date): string {
  return d.toLocaleDateString(dateLocale(), { month: "long", year: "numeric" })
}

// Status to bar color mapping
function getBarColor(status: string): { bg: string; border: string; text: string } {
  const s = status.toUpperCase()
  if (["NEW"].includes(s)) return { bg: "bg-blue-500/80", border: "border-blue-600/30", text: "text-white" }
  if (["ASSIGNED", "ACCEPTED"].includes(s)) return { bg: "bg-purple-500/80", border: "border-purple-600/30", text: "text-white" }
  if (["EN_ROUTE", "ARRIVED", "IN_PROGRESS"].includes(s)) return { bg: "bg-amber-500/80", border: "border-amber-600/30", text: "text-white" }
  if (["BLOCKED"].includes(s)) return { bg: "bg-red-500/80", border: "border-red-600/30", text: "text-white" }
  if (["COMPLETED", "CLOSED"].includes(s)) return { bg: "bg-green-500/80", border: "border-green-600/30", text: "text-white" }
  if (["CANCELED"].includes(s)) return { bg: "bg-slate-400/80", border: "border-slate-500/30", text: "text-white" }
  return { bg: "bg-slate-400/80", border: "border-slate-500/30", text: "text-white" }
}

const ROW_HEIGHT = 36
const HEADER_HEIGHT = 52
const LEFT_PANEL_WIDTH = 260
const MIN_COL_WIDTH_DAY = 120
const MIN_COL_WIDTH_WEEK = 44
const MIN_COL_WIDTH_MONTH = 14

// ─── Types ──────────────────────────────────────────────────────────────────

interface TimelineGroup {
  label: string
  color?: string
  tasks: Task[]
}

interface TimelineViewProps {
  tasks: Task[]
  phases?: Phase[]
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

const TaskTooltip = React.memo(function TaskTooltip({
  task,
  style,
}: {
  task: Task
  style: React.CSSProperties
}) {
  const { t } = useTranslation()
  const statusConfig = getStatusConfig(task.status)
  return (
    <div
      className="fixed z-[100] pointer-events-none px-3 py-2.5 bg-popover border border-border rounded-xl shadow-xl min-w-[200px] max-w-[280px]"
      style={{ ...style, animation: `fadeSlideIn 0.15s ${APPLE_EASE} both` }}
    >
      <p className="text-sm font-semibold text-foreground line-clamp-2 mb-1.5">{task.title}</p>
      <div className="flex items-center gap-2 mb-1">
        <span
          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ backgroundColor: `${statusConfig.hex}20`, color: statusConfig.hex }}
        >
          {statusConfig.label}
        </span>
        {task.priority && (
          <span className="text-[10px] text-muted-foreground font-medium uppercase">{t(`tasks.priority.${task.priority}`)}</span>
        )}
      </div>
      {task.startDate && (
        <p className="text-[11px] text-muted-foreground">
          {t("tasks.timeline.startLabel", { date: new Date(task.startDate).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" }) })}
        </p>
      )}
      {task.dueDate && (
        <p className="text-[11px] text-muted-foreground">
          {t("tasks.timeline.dueLabel", { date: new Date(task.dueDate).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" }) })}
        </p>
      )}
      {task.estimatedHours != null && (
        <p className="text-[11px] text-muted-foreground">{t("tasks.timeline.estLabel", { hours: task.estimatedHours })}</p>
      )}
      {task.assignedTo && (
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {task.assignedTo.firstName} {task.assignedTo.lastName}
        </p>
      )}
    </div>
  )
})

// ─── Task Row (memoized) ───────────────────────────────────────────────────

const TaskRow = React.memo(function TaskRow({
  task,
  animDelay,
}: {
  task: Task
  animDelay: number
}) {
  const isOverdue = isTaskOverdue(task)
  const statusConfig = getStatusConfig(task.status)

  return (
    <Link
      href={`/tasks/${task.id}`}
      className={cn(
        "flex items-center gap-2.5 px-3 border-b border-border/10",
        "hover:bg-accent/50 transition-colors duration-100 group"
      )}
      style={{
        height: ROW_HEIGHT,
        animation: `fadeSlideIn 0.3s ${APPLE_EASE} ${animDelay}ms both`,
      }}
    >
      <span
        className="size-2 rounded-full flex-shrink-0 ring-1 ring-inset ring-black/5"
        style={{ backgroundColor: statusConfig.hex }}
      />
      <span
        className={cn(
          "text-[13px] truncate flex-1 group-hover:text-blue-600 transition-colors duration-100",
          isOverdue ? "text-foreground font-medium" : "text-foreground/80"
        )}
      >
        {task.title}
      </span>
      {task.assignedTo && (
        <UserAvatar
          firstName={task.assignedTo.firstName}
          lastName={task.assignedTo.lastName}
          avatarUrl={task.assignedTo.avatarUrl}
          seed={task.assignedTo.id}
          size="xs"
        />
      )}
    </Link>
  )
})

// ─── Component ──────────────────────────────────────────────────────────────

export function TimelineView({ tasks, phases }: TimelineViewProps) {
  const { t } = useTranslation()
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

    const cw =
      scale === "day"
        ? MIN_COL_WIDTH_DAY
        : scale === "week"
          ? MIN_COL_WIDTH_WEEK
          : MIN_COL_WIDTH_MONTH

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
    [rangeStart, colWidth]
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
          const predEnd = task.dueDate ? startOfDay(new Date(task.dueDate)) : task.startDate ? startOfDay(new Date(task.startDate)) : null
          if (!predEnd) continue

          // Successor start
          const succTask = tasks.find((t) => t.id === dep.successorId)
          if (!succTask) continue
          const succStart = succTask.startDate ? startOfDay(new Date(succTask.startDate)) : succTask.dueDate ? startOfDay(new Date(succTask.dueDate)) : null
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

  return (
    <div
      className="bg-card rounded-xl border border-border/50 overflow-hidden shadow-sm"
      style={{ animation: `fadeSlideIn 0.3s ${APPLE_EASE} both` }}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-muted/20">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">{tasks.length}</span>
          <span>{t("tasks.timeline.tasksLabel")}</span>
        </div>
        <div className="flex items-center bg-muted/80 rounded-lg p-0.5">
          {(["day", "week", "month"] as TimeScale[]).map((s) => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium capitalize transition-all duration-200",
                scale === s
                  ? "bg-card shadow-sm text-foreground ring-1 ring-border/30"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`tasks.timeline.scale.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline Container */}
      <div className="flex" style={{ height: `${Math.min(totalRows * ROW_HEIGHT + HEADER_HEIGHT + 2, 600)}px` }}>
        {/* Left Panel (sticky task list) */}
        <div
          ref={leftPanelRef}
          className="flex-shrink-0 border-r border-border/40 overflow-hidden bg-card"
          style={{ width: LEFT_PANEL_WIDTH }}
        >
          {/* Left header */}
          <div
            className="flex items-end px-3 pb-2 border-b border-border/40 bg-muted/20"
            style={{ height: HEADER_HEIGHT }}
          >
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("tasks.page.heading")}</span>
          </div>

          {/* Task rows */}
          <div className="overflow-hidden" style={{ height: `calc(100% - ${HEADER_HEIGHT}px)` }}>
            {groups.map((group, gi) => (
              <React.Fragment key={gi}>
                {/* Group header */}
                <div
                  className="flex items-center gap-2 px-3 bg-muted/40 border-b border-border/20"
                  style={{ height: ROW_HEIGHT }}
                >
                  {group.color && (
                    <span className="size-2.5 rounded flex-shrink-0" style={{ backgroundColor: group.color }} />
                  )}
                  <span className="text-[11px] font-bold text-foreground/70 uppercase tracking-wider truncate">{group.label}</span>
                  <span className="text-[10px] text-muted-foreground/60 ml-auto tabular-nums font-medium">{group.tasks.length}</span>
                </div>

                {/* Task rows */}
                {group.tasks.map((task, ti) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    animDelay={(gi * 3 + ti) * 20}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Right Panel (scrollable timeline) */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-auto"
          onScroll={handleTimelineScroll}
          style={{ scrollBehavior: "smooth" }}
        >
          {/* Time header */}
          <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm border-b border-border/40" style={{ height: HEADER_HEIGHT }}>
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
                          : "text-muted-foreground/50"
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
                    isWk ? "bg-muted/25 border-border/8" : "border-border/8"
                  )}
                  style={{ left: ci * colWidth, width: colWidth }}
                />
              )
            })}

            {/* Today line */}
            <div
              className="absolute top-0 bottom-0 z-10 pointer-events-none"
              style={{ left: todayOffset, width: 0 }}
            >
              {/* "Today" label */}
              <div className="absolute -top-[3px] -translate-x-1/2 whitespace-nowrap">
                <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider bg-card px-1 rounded">{t("common.today")}</span>
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
                  />
                )
                currentRow++

                // Task bars
                for (const task of group.tasks) {
                  const barStyle = getBarStyle(task)
                  const barColors = getBarColor(task.status)
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
                            barColors.bg, barColors.border
                          )}
                          style={{
                            ...barStyle,
                            animation: `fadeSlideIn 0.4s ${APPLE_EASE} ${currentRow * 20}ms both`,
                          }}
                          onMouseEnter={(e) =>
                            setTooltip({ task, x: e.clientX + 12, y: e.clientY + 16 })
                          }
                          onMouseMove={(e) =>
                            setTooltip((prev) => prev ? { ...prev, x: e.clientX + 12, y: e.clientY + 16 } : null)
                          }
                          onMouseLeave={() => setTooltip(null)}
                        >
                          <Link
                            href={`/tasks/${task.id}`}
                            className={cn(
                              "h-full px-2 flex items-center overflow-hidden",
                              barColors.text
                            )}
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
                          onMouseEnter={(e) =>
                            setTooltip({ task, x: e.clientX + 12, y: e.clientY + 16 })
                          }
                          onMouseMove={(e) =>
                            setTooltip((prev) => prev ? { ...prev, x: e.clientX + 12, y: e.clientY + 16 } : null)
                          }
                          onMouseLeave={() => setTooltip(null)}
                        >
                          <Link href={`/tasks/${task.id}`}>
                            <svg
                              className="size-6 drop-shadow-sm"
                              viewBox="0 0 24 24"
                              fill={getStatusConfig(task.status).hex}
                              stroke={getStatusConfig(task.status).hex}
                              strokeWidth="1"
                            >
                              <path d="M12 2 L22 12 L12 22 L2 12 Z" />
                            </svg>
                          </Link>
                        </div>
                      )}
                    </div>
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
                  <marker
                    id="arrowhead"
                    markerWidth="7"
                    markerHeight="5"
                    refX="6"
                    refY="2.5"
                    orient="auto"
                  >
                    <polygon
                      points="0 0, 7 2.5, 0 5"
                      className="fill-muted-foreground/50"
                    />
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
      </div>

      {/* Tooltip — portal to body to avoid stacking context issues */}
      {tooltip && typeof document !== 'undefined' && ReactDOM.createPortal(
        <TaskTooltip
          task={tooltip.task}
          style={{ left: tooltip.x, top: tooltip.y }}
        />,
        document.body
      )}
    </div>
  )
}

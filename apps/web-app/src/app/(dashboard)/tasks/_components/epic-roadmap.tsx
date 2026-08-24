"use client"

import React, { useMemo, useRef, useState, useCallback, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Task, Epic } from "@/lib/api"
import { dateLocale } from "@/lib/format-date"

// ─── Constants ─────────────────────────────────────────────────────────────

const ROW_HEIGHT = 52
const HEADER_HEIGHT = 36
const LEFT_PANEL_WIDTH = 240
const DAY_WIDTH = 16

const DONE_STATUSES = ["COMPLETED", "CLOSED"]

// ─── Helpers ───────────────────────────────────────────────────────────────

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

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString(dateLocale(), { month: "short", year: "numeric" })
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString(dateLocale(), { month: "short", day: "numeric" })
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface EpicRoadmapProps {
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

// ─── Component ─────────────────────────────────────────────────────────────

export function EpicRoadmap({ epics, tasks, activeEpicId, onEpicClick }: EpicRoadmapProps) {
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
        label: formatMonthYear(monthStart),
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

  if (epics.length === 0) return null

  return (
    <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
      {/* Active filter indicator */}
      {activeEpicId && (() => {
        const active = epicRows.find(r => r.epic.id === activeEpicId)
        if (!active) return null
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 border-b border-border/30">
            <span className="size-2 rounded-full" style={{ backgroundColor: active.epic.color }} />
            <span className="text-xs text-muted-foreground">
              {t("tasks.epicRoadmap.filteredTo")} <span className="font-medium text-foreground">{active.epic.name}</span>
            </span>
            <button
              onClick={() => onEpicClick?.(null)}
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })()}

      <div className="flex">
        {/* Left panel — epic labels */}
        <div className="shrink-0 border-r border-border/40 bg-muted/20" style={{ width: LEFT_PANEL_WIDTH }}>
          <div className="flex items-center px-3 border-b border-border/40" style={{ height: HEADER_HEIGHT }}>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("tasks.epicRoadmap.epics")}</span>
          </div>

          {epicRows.map((row) => {
            const isActive = activeEpicId === row.epic.id
            const isComplete = row.progressPct === 100
            return (
              <div
                key={row.epic.id}
                className={cn(
                  "flex items-center gap-2.5 px-3 border-b border-border/10 cursor-pointer transition-colors duration-100",
                  isActive ? "bg-accent/50" : "hover:bg-accent/30",
                )}
                style={{ height: ROW_HEIGHT }}
                onClick={() => handleEpicClick(row.epic.id)}
                onMouseEnter={() => setHoveredEpicId(row.epic.id)}
                onMouseLeave={() => setHoveredEpicId(null)}
              >
                {/* Status indicator */}
                {isComplete ? (
                  <div className="size-4 rounded-full bg-green-500/15 dark:bg-green-500/20 flex items-center justify-center shrink-0">
                    <Check className="size-2.5 text-green-600 dark:text-green-400" />
                  </div>
                ) : (
                  <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: row.epic.color }} />
                )}

                <div className="min-w-0 flex-1">
                  <p className={cn(
                    "text-sm font-medium truncate leading-tight",
                    isComplete ? "text-muted-foreground line-through" : "text-foreground",
                  )}>
                    {row.epic.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {/* Mini progress bar */}
                    <div className="h-1 w-12 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{
                          width: `${row.progressPct}%`,
                          backgroundColor: isComplete ? "#22C55E" : row.epic.color,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {row.completedTasks}/{row.totalTasks}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Right panel — scrollable timeline */}
        <div className="flex-1 overflow-x-auto scrollbar-hide" ref={scrollRef}>
          <div style={{ width: totalWidth, minWidth: "100%" }}>
            {/* Month header */}
            <div className="relative border-b border-border/40 bg-muted/10" style={{ height: HEADER_HEIGHT }}>
              {months.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 flex items-center justify-center border-r border-border/20 text-[11px] font-medium text-muted-foreground"
                  style={{ left: m.offsetDays * DAY_WIDTH, width: m.widthDays * DAY_WIDTH, height: HEADER_HEIGHT }}
                >
                  {m.label}
                </div>
              ))}
              {/* Today marker in header */}
              <div className="absolute top-0 w-px bg-blue-500" style={{ left: todayOffset * DAY_WIDTH, height: HEADER_HEIGHT }}>
                <span className="absolute -top-0 left-1/2 -translate-x-1/2 text-[8px] font-bold text-blue-500 uppercase">
                  {t("common.today")}
                </span>
              </div>
            </div>

            {/* Epic bar rows */}
            {epicRows.map((row) => {
              const barPos = row.hasDateRange ? getBarPosition(row.startDate, row.endDate) : null
              const isActive = activeEpicId === row.epic.id
              const isHovered = hoveredEpicId === row.epic.id
              const isComplete = row.progressPct === 100

              return (
                <div
                  key={row.epic.id}
                  className={cn(
                    "relative border-b border-border/10 transition-colors duration-100",
                    isActive && "bg-accent/30",
                    isHovered && !isActive && "bg-accent/15",
                  )}
                  style={{ height: ROW_HEIGHT }}
                  onMouseEnter={() => setHoveredEpicId(row.epic.id)}
                  onMouseLeave={() => setHoveredEpicId(null)}
                >
                  {/* Today line */}
                  <div
                    className="absolute top-0 w-px border-l border-dashed border-blue-500/30"
                    style={{ left: todayOffset * DAY_WIDTH, height: ROW_HEIGHT }}
                  />

                  {barPos ? (
                    <div
                      className={cn(
                        "absolute top-2.5 rounded-lg cursor-pointer transition-all duration-150",
                        isHovered || isActive ? "shadow-md scale-[1.01]" : "shadow-sm",
                      )}
                      style={{ left: barPos.left, width: barPos.width, height: ROW_HEIGHT - 20 }}
                      onClick={() => handleEpicClick(row.epic.id)}
                    >
                      {/* Background */}
                      <div className="absolute inset-0 rounded-lg opacity-15" style={{ backgroundColor: row.epic.color }} />
                      {/* Progress fill */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-lg opacity-40 transition-[width] duration-300"
                        style={{
                          backgroundColor: row.epic.color,
                          width: `${row.progressPct}%`,
                          borderTopRightRadius: row.progressPct >= 100 ? undefined : 0,
                          borderBottomRightRadius: row.progressPct >= 100 ? undefined : 0,
                        }}
                      />
                      {/* Content inside bar */}
                      <div className="absolute inset-0 flex items-center justify-between px-2 gap-2">
                        {barPos.width > 100 && (
                          <span className="text-[10px] font-semibold truncate" style={{ color: row.epic.color }}>
                            {row.epic.name}
                          </span>
                        )}
                        {barPos.width > 60 && (
                          <span className="text-[9px] font-medium shrink-0 opacity-70" style={{ color: row.epic.color }}>
                            {row.progressPct}%
                          </span>
                        )}
                      </div>
                      {/* Start date label */}
                      {row.startDate && barPos.width > 40 && (
                        <span className="absolute -bottom-3.5 left-0 text-[8px] text-muted-foreground/60">
                          {formatShortDate(row.startDate)}
                        </span>
                      )}
                      {/* End date label */}
                      {row.endDate && barPos.width > 40 && (
                        <span className="absolute -bottom-3.5 right-0 text-[8px] text-muted-foreground/60">
                          {formatShortDate(row.endDate)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="absolute top-2.5 left-4 flex items-center" style={{ height: ROW_HEIGHT - 20 }}>
                      <span className="text-[10px] text-muted-foreground/40 italic">{t("tasks.epicRoadmap.noDates")}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

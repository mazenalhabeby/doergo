"use client"

import React, { useMemo, useRef, useState, useCallback, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { startOfDay, addDays, diffDays } from "@/lib/local-days"
import type { Task, Epic } from "@/lib/api"
import { formatDayMonth, formatMonthYear } from "@/lib/format-date"
import { useEpicRoadmap, DAY_WIDTH, type EpicRoadmapProps } from "./use-epic-roadmap"
import { ROW_HEIGHT, HEADER_HEIGHT, LEFT_PANEL_WIDTH } from "./epic-roadmap-helpers"

// ─── Constants ─────────────────────────────────────────────────────────────

// ─── Component ─────────────────────────────────────────────────────────────

export function EpicRoadmap({ epics, tasks, activeEpicId, onEpicClick }: EpicRoadmapProps) {
  const {
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
  } = useEpicRoadmap({ epics, tasks, activeEpicId, onEpicClick })

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
                  className={"absolute top-0 flex items-center justify-center border-r " +
                    "border-border/20 text-[11px] font-medium text-muted-foreground"}
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
                          {formatDayMonth(row.startDate, false)}
                        </span>
                      )}
                      {/* End date label */}
                      {row.endDate && barPos.width > 40 && (
                        <span className="absolute -bottom-3.5 right-0 text-[8px] text-muted-foreground/60">
                          {formatDayMonth(row.endDate, false)}
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

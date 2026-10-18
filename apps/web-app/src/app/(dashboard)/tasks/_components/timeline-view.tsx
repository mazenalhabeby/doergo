"use client"

import React from "react"
import ReactDOM from "react-dom"
import { cn } from "@/lib/utils"
import { useTimelineView, type TimeScale, ROW_HEIGHT, type TimelineViewProps } from "./use-timeline-view"
import { APPLE_EASE, HEADER_HEIGHT, LEFT_PANEL_WIDTH, TaskTooltip, TaskRow } from "./timeline-view-helpers"
import { TimelineViewToday } from "./timeline-view-today"

// ─── Component ──────────────────────────────────────────────────────────────

export function TimelineView({ tasks, phases }: TimelineViewProps) {
  const vm = useTimelineView({ tasks, phases })
  const {
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
  } = vm

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
                    statusConfig={stepOf(task)}
                    animDelay={(gi * 3 + ti) * 20}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Right Panel (scrollable timeline) */}
        <TimelineViewToday vm={vm} />
      </div>

      {/* Tooltip — portal to body to avoid stacking context issues */}
      {tooltip && typeof document !== 'undefined' && ReactDOM.createPortal(
        <TaskTooltip
          task={tooltip.task}
          statusConfig={stepOf(tooltip.task)}
          style={{ left: tooltip.x, top: tooltip.y }}
        />,
        document.body
      )}
    </div>
  )
}

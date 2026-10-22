"use client"

import React from "react"
import ReactDOM from "react-dom"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import { useTimelineView, type TimelineViewProps } from "./use-timeline-view"
import { APPLE_EASE, HEADER_HEIGHT, ROW_HEIGHT, type TimeScale } from "./timeline-layout"
import { TaskTooltip } from "./timeline-task-tooltip"
import { TimelineTaskList } from "./timeline-task-list"
import { TimelineChart } from "./timeline-chart"

/** Tasks on a day/week/month timeline, grouped by phase, with their dependencies. */
export function TimelineView({ tasks, phases }: TimelineViewProps) {
  const { t } = useTranslation()
  const {
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
  } = useTimelineView({ tasks, phases })

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
                  : "text-muted-foreground hover:text-foreground",
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
        <TimelineTaskList panelRef={leftPanelRef} groups={groups} stepOf={stepOf} />

        {/* Right Panel (scrollable timeline) */}
        <TimelineChart
          timelineRef={timelineRef}
          onScroll={handleTimelineScroll}
          monthHeaders={monthHeaders}
          columns={columns}
          colWidth={colWidth}
          scale={scale}
          timelineWidth={timelineWidth}
          totalRows={totalRows}
          todayOffset={todayOffset}
          groups={groups}
          getBarStyle={getBarStyle}
          stepOf={stepOf}
          setTooltip={setTooltip}
          dependencyLines={dependencyLines}
        />
      </div>

      {/* Tooltip — portal to body to avoid stacking context issues */}
      {tooltip &&
        typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <TaskTooltip
            task={tooltip.task}
            statusConfig={stepOf(tooltip.task)}
            style={{ left: tooltip.x, top: tooltip.y }}
          />,
          document.body,
        )}
    </div>
  )
}

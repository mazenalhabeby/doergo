"use client"

import React from "react"
import { isTaskOverdue } from "@hbcfield/shared/client"
import { useTranslation } from "react-i18next"
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { StatusConfig } from "@/lib/constants"
import type { Task } from "@/lib/api"
import { TaskPersonAvatar } from "./task-avatars"
import { APPLE_EASE, HEADER_HEIGHT, LEFT_PANEL_WIDTH, ROW_HEIGHT } from "./timeline-layout"
import type { TimelineGroup } from "./use-timeline-view"

/** The timeline's left panel: the tasks by phase, scrolled in step with the chart beside it. */
export function TimelineTaskList({
  panelRef,
  groups,
  stepOf,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>
  groups: TimelineGroup[]
  stepOf: (task: Task) => StatusConfig
}) {
  const { t } = useTranslation()
  return (
    <div
      ref={panelRef}
      className="flex-shrink-0 border-r border-border/40 overflow-hidden bg-card"
      style={{ width: LEFT_PANEL_WIDTH }}
    >
      {/* Left header */}
      <div className="flex items-end px-3 pb-2 border-b border-border/40 bg-muted/20" style={{ height: HEADER_HEIGHT }}>
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {t("tasks.page.heading")}
        </span>
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
              <span className="text-[11px] font-bold text-foreground/70 uppercase tracking-wider truncate">
                {group.label}
              </span>
              <span className="text-[10px] text-muted-foreground/60 ml-auto tabular-nums font-medium">
                {group.tasks.length}
              </span>
            </div>

            {/* Task rows */}
            {group.tasks.map((task, ti) => (
              <TaskRow key={task.id} task={task} statusConfig={stepOf(task)} animDelay={(gi * 3 + ti) * 20} />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

export const TaskRow = React.memo(function TaskRow({
  task,
  statusConfig,
  animDelay,
}: {
  task: Task
  statusConfig: StatusConfig
  animDelay: number
}) {
  const isOverdue = isTaskOverdue(task)

  return (
    <Link
      href={`/tasks/${task.id}`}
      className={cn(
        "flex items-center gap-2.5 px-3 border-b border-border/10",
        "hover:bg-accent/50 transition-colors duration-100 group",
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
          isOverdue ? "text-foreground font-medium" : "text-foreground/80",
        )}
      >
        {task.title}
      </span>
      {task.assignedTo && <TaskPersonAvatar person={task.assignedTo} />}
    </Link>
  )
})

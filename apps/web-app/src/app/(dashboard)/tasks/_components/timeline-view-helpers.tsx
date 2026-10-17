"use client"

import React from "react"
import { personName, isTaskOverdue } from "@hbcfield/shared/client"
import { useTranslation } from "react-i18next"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { TaskPersonAvatar } from "./task-avatars"
import type { StatusConfig } from "@/lib/constants"
import type { Task } from "@/lib/api"
import { dateLocale } from "@/lib/format-date"
import { type TimeScale, ROW_HEIGHT } from "./use-timeline-view"

/** TimelineView's module-level helpers, moved here unchanged so its sections can read them too. */
export const APPLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatHeaderDate(d: Date, scale: TimeScale): string {
  if (scale === "day") {
    return d.toLocaleDateString(dateLocale(), { weekday: "short", month: "short", day: "numeric" })
  }
  if (scale === "week") {
    return d.toLocaleDateString(dateLocale(), { month: "short", day: "numeric" })
  }
  // month
  return d.toLocaleDateString(dateLocale(), { month: "short", year: "numeric" })
}

export const HEADER_HEIGHT = 52

export const LEFT_PANEL_WIDTH = 260

// ─── Tooltip ────────────────────────────────────────────────────────────────

export const TaskTooltip = React.memo(function TaskTooltip({
  task,
  statusConfig,
  style,
}: {
  task: Task
  /** The step's look from the task's own flow — see useStepConfigs. */
  statusConfig: StatusConfig
  style: React.CSSProperties
}) {
  const { t } = useTranslation()
  return (
    <div
      className={"fixed z-[100] pointer-events-none px-3 py-2.5 bg-popover border " +
        "border-border rounded-xl shadow-xl min-w-[200px] max-w-[280px]"}
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
          {t(
            "tasks.timeline.startLabel",
            { date: new Date(task.startDate).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" }) })}
        </p>
      )}
      {task.dueDate && (
        <p className="text-[11px] text-muted-foreground">
          {t(
            "tasks.timeline.dueLabel",
            { date: new Date(task.dueDate).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" }) })}
        </p>
      )}
      {task.estimatedHours != null && (
        <p className="text-[11px] text-muted-foreground">{t("tasks.timeline.estLabel", { hours: task.estimatedHours })}</p>
      )}
      {task.assignedTo && (
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {personName(task.assignedTo)}
        </p>
      )}
    </div>
  )
})

// ─── Task Row (memoized) ───────────────────────────────────────────────────

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
        <TaskPersonAvatar person={task.assignedTo} />
      )}
    </Link>
  )
})

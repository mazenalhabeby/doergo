"use client"

import React from "react"
import { personName } from "@hbcfield/shared/client"
import { useTranslation } from "react-i18next"
import type { StatusConfig } from "@/lib/constants"
import type { Task } from "@/lib/api"
import { dateLocale } from "@/lib/format-date"
import { APPLE_EASE } from "./timeline-layout"

/** The card that follows the pointer over a timeline bar: step, priority, dates, estimate, assignee. */
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
      className={
        "fixed z-[100] pointer-events-none px-3 py-2.5 bg-popover border " +
        "border-border rounded-xl shadow-xl min-w-[200px] max-w-[280px]"
      }
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
          <span className="text-[10px] text-muted-foreground font-medium uppercase">
            {t(`tasks.priority.${task.priority}`)}
          </span>
        )}
      </div>
      {task.startDate && (
        <p className="text-[11px] text-muted-foreground">
          {t("tasks.timeline.startLabel", {
            date: new Date(task.startDate).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" }),
          })}
        </p>
      )}
      {task.dueDate && (
        <p className="text-[11px] text-muted-foreground">
          {t("tasks.timeline.dueLabel", {
            date: new Date(task.dueDate).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" }),
          })}
        </p>
      )}
      {task.estimatedHours != null && (
        <p className="text-[11px] text-muted-foreground">
          {t("tasks.timeline.estLabel", { hours: task.estimatedHours })}
        </p>
      )}
      {task.assignedTo && <p className="text-[11px] text-muted-foreground mt-0.5">{personName(task.assignedTo)}</p>}
    </div>
  )
})

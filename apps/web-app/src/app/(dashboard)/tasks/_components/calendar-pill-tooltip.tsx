"use client"

import { personName } from "@hbcfield/shared/client"
import React from "react"
import type { StatusConfig } from "@/lib/constants"
import type { Task } from "@/lib/api"
import { APPLE_EASE } from "./calendar-cell"

/** The card that follows the pointer over a calendar pill or bar: title, step, priority, assignee. */
export const PillTooltip = React.memo(function PillTooltip({
  task,
  statusConfig,
  style,
}: {
  task: Task
  /** The step's look from the task's own flow — see useStepConfigs. */
  statusConfig: StatusConfig
  style: React.CSSProperties
}) {
  return (
    <div
      className={
        "fixed z-[100] pointer-events-none px-3 py-2.5 bg-popover border " +
        "border-border rounded-xl shadow-xl min-w-[180px] max-w-[260px]"
      }
      style={{ ...style, animation: `fadeSlideIn 0.15s ${APPLE_EASE} both` }}
    >
      <p className="text-sm font-semibold text-foreground line-clamp-2 mb-1">{task.title}</p>
      <div className="flex items-center gap-2 mb-1">
        <span
          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ backgroundColor: `${statusConfig.hex}20`, color: statusConfig.hex }}
        >
          {statusConfig.label}
        </span>
        <span className="text-[10px] text-muted-foreground font-medium uppercase">{task.priority}</span>
      </div>
      {task.assignedTo && <p className="text-[11px] text-muted-foreground">{personName(task.assignedTo)}</p>}
    </div>
  )
})

"use client"

import { isTaskOverdue } from "@hbcfield/shared/client"
import type { Task } from "@/lib/api"
import { dateLocale } from "@/lib/format-date"
import { timeOf } from "@/lib/due-time"
import { cn } from "@/lib/utils"

/** A row's "when" (the boards' `kwhen`): the weekday small, the day big, and the hour when one was named. */
export function TaskRowWhen({ task }: { task: Task }) {
  if (!task.dueDate) return <span className="text-sm text-muted-foreground/40">—</span>
  const d = new Date(task.dueDate)
  const locale = dateLocale()
  const overdue = isTaskOverdue(task)
  const time = timeOf(d)
  return (
    <span className="flex flex-col leading-tight">
      <span className={cn("text-[11.5px] font-semibold", overdue ? "text-shell-crit" : "text-muted-foreground")}>
        {d.toLocaleDateString(locale, { weekday: "short" })}
      </span>
      <b className={cn("text-[15px] font-semibold tabular-nums", overdue ? "text-shell-crit" : "text-foreground")}>
        {d.toLocaleDateString(locale, { month: "short", day: "numeric" })}
      </b>
      {time && <span className="text-xs tabular-nums text-muted-foreground">{time}</span>}
    </span>
  )
}

/** The priority as the boards write it after a title: a small capital word, coral when urgent, amber when high. */
export function PriorityTag({ priority, label }: { priority: string; label: string }) {
  return (
    <span
      className={cn(
        "ml-2 shrink-0 text-[11px] font-bold uppercase tracking-[0.04em]",
        priority === "URGENT" ? "text-shell-crit" : priority === "HIGH" ? "text-shell-warn" : "text-muted-foreground",
      )}
    >
      {label}
    </span>
  )
}

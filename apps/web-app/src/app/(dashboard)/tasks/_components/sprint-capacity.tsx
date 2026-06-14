"use client"

import React, { useState, useMemo } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Sprint, Task } from "@/lib/api"

interface SprintCapacityBarProps {
  sprint: Sprint
  tasks: Task[]
  teamSize?: number
  averageVelocity?: number
}

export function SprintCapacityBar({
  sprint,
  tasks,
  teamSize,
  averageVelocity,
}: SprintCapacityBarProps) {
  const [expanded, setExpanded] = useState(false)

  const capacity = averageVelocity ?? 40
  const committed = useMemo(
    () => tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0),
    [tasks],
  )
  const unestimated = useMemo(
    () => tasks.filter((t) => !t.storyPoints).length,
    [tasks],
  )
  const pct = capacity > 0 ? (committed / capacity) * 100 : 0
  const overBy = committed > capacity ? committed - capacity : 0

  // Per-person breakdown
  const assigneeBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { name: string; points: number; taskCount: number }
    >()

    for (const task of tasks) {
      const pts = task.storyPoints || 0

      // Multi-assignee
      if (task.assignees && task.assignees.length > 0) {
        for (const a of task.assignees) {
          const key = a.user?.id ?? a.userId
          const name = a.user
            ? `${a.user.firstName ?? ""} ${a.user.lastName ?? ""}`.trim()
            : key
          const existing = map.get(key)
          if (existing) {
            existing.points += pts
            existing.taskCount += 1
          } else {
            map.set(key, { name: name || "Unknown", points: pts, taskCount: 1 })
          }
        }
      } else if (task.assignedTo) {
        const key = task.assignedTo.id
        const name =
          `${task.assignedTo.firstName ?? ""} ${task.assignedTo.lastName ?? ""}`.trim()
        const existing = map.get(key)
        if (existing) {
          existing.points += pts
          existing.taskCount += 1
        } else {
          map.set(key, { name: name || "Unknown", points: pts, taskCount: 1 })
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.points - a.points)
  }, [tasks])

  const effectiveTeamSize = teamSize ?? assigneeBreakdown.length
  const fairShare =
    effectiveTeamSize > 0 ? Math.round(capacity / effectiveTeamSize) : capacity

  // Bar color
  const barColor =
    pct > 100
      ? "bg-red-500"
      : pct >= 80
        ? "bg-amber-500"
        : "bg-emerald-500"

  return (
    <div className="rounded-lg border border-border/40 bg-muted/30 px-4 py-2.5">
      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-border/50 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", barColor)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">
          {committed} / {capacity} pts
        </span>
        <span className="tabular-nums">{tasks.length} tasks</span>
        {unestimated > 0 && (
          <span className="tabular-nums">{unestimated} unestimated</span>
        )}
        {overBy > 0 && (
          <span className="font-medium text-red-600 dark:text-red-400">
            Over by {overBy} pts
          </span>
        )}

        {/* Per-person toggle */}
        {assigneeBreakdown.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            Per person
          </button>
        )}
      </div>

      {/* Per-person breakdown */}
      {expanded && assigneeBreakdown.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-border/30 pt-2">
          {assigneeBreakdown.map((person) => {
            const isOver = person.points > fairShare
            return (
              <div
                key={person.name}
                className="flex items-center justify-between text-xs"
              >
                <span
                  className={cn(
                    "text-muted-foreground",
                    isOver && "text-amber-600 dark:text-amber-400 font-medium",
                  )}
                >
                  {person.name}
                </span>
                <span
                  className={cn(
                    "tabular-nums text-muted-foreground",
                    isOver && "text-amber-600 dark:text-amber-400 font-medium",
                  )}
                >
                  {person.points} pts ({person.taskCount} tasks)
                  {isOver && " *"}
                </span>
              </div>
            )
          })}
          {effectiveTeamSize > 0 && (
            <p className="text-[10px] text-muted-foreground/60 pt-0.5">
              * Over fair share ({fairShare} pts/person)
            </p>
          )}
        </div>
      )}
    </div>
  )
}

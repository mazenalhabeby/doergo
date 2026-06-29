"use client"

import React, { useMemo, useState } from "react"
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Hash,
  AlertTriangle,
  Calendar,
  Type,
  MoveRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTranslation } from "react-i18next"
import { getPriorityConfig } from "@/lib/constants"
import type { Task, Sprint } from "@/lib/api"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BacklogSortField = "priority" | "createdAt" | "storyPoints" | "title"
export type BacklogSortDir = "asc" | "desc"

export interface BacklogToolbarProps {
  tasks: Task[]
  selectedIds: Set<string>
  onBulkEstimate: (taskIds: string[], points: number) => void
  onBulkPriority: (taskIds: string[], priority: string) => void
  onMoveToSprint: (taskIds: string[], sprintId: string) => void
  sprints: Sprint[]
  sortField: BacklogSortField
  sortDir: BacklogSortDir
  onSortFieldChange: (field: BacklogSortField) => void
  onSortDirChange: (dir: BacklogSortDir) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIBONACCI = [1, 2, 3, 5, 8, 13, 21] as const

const SORT_OPTIONS: { value: BacklogSortField; labelKey: string; icon: typeof ArrowUpDown }[] = [
  { value: "priority", labelKey: "tasks.backlog.sort.priority", icon: AlertTriangle },
  { value: "createdAt", labelKey: "tasks.backlog.sort.createdAt", icon: Calendar },
  { value: "storyPoints", labelKey: "tasks.backlog.sort.storyPoints", icon: Hash },
  { value: "title", labelKey: "tasks.backlog.sort.title", icon: Type },
]

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

const PRIORITY_KEYS = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const

// ---------------------------------------------------------------------------
// Sort helper (exported so page.tsx can use it)
// ---------------------------------------------------------------------------

export function sortBacklogTasks(
  tasks: Task[],
  field: BacklogSortField,
  dir: BacklogSortDir,
): Task[] {
  return [...tasks].sort((a, b) => {
    let cmp = 0
    switch (field) {
      case "priority":
        cmp = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
        break
      case "createdAt":
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        break
      case "storyPoints":
        cmp = (a.storyPoints ?? -1) - (b.storyPoints ?? -1)
        break
      case "title":
        cmp = a.title.localeCompare(b.title)
        break
    }
    return dir === "asc" ? cmp : -cmp
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function BacklogToolbarInner({
  tasks,
  selectedIds,
  onBulkEstimate,
  onBulkPriority,
  onMoveToSprint,
  sprints,
  sortField,
  sortDir,
  onSortFieldChange,
  onSortDirChange,
}: BacklogToolbarProps) {
  const { t } = useTranslation()
  const ids = useMemo(() => Array.from(selectedIds), [selectedIds])
  const hasSelection = ids.length > 0

  // Stats
  const stats = useMemo(() => {
    const total = tasks.length
    const unestimated = tasks.filter(t => t.storyPoints == null || t.storyPoints === 0).length
    const totalPoints = tasks.reduce((s, t) => s + (t.storyPoints || 0), 0)

    const priorityCounts: Record<string, number> = { URGENT: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
    for (const t of tasks) {
      const key = t.priority?.toUpperCase() ?? "MEDIUM"
      if (key in priorityCounts) priorityCounts[key]!++
    }
    return { total, unestimated, totalPoints, priorityCounts }
  }, [tasks])

  // Available sprints for "Move to Sprint" (PLANNING or ACTIVE only)
  const targetSprints = useMemo(
    () => sprints.filter(s => s.status === "PLANNING" || s.status === "ACTIVE"),
    [sprints],
  )

  const currentSortOption = SORT_OPTIONS.find(o => o.value === sortField) ?? SORT_OPTIONS[0]!

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2 rounded-xl mb-3",
        "bg-muted/50 border border-border/50",
      )}
    >
      {/* ── Stats strip ──────────────────────────────────── */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground mr-auto">
        <span>
          <span className="font-semibold text-foreground tabular-nums">{stats.total}</span>{" "}
          {t("tasks.backlog.tasksLabel")}
        </span>

        {stats.unestimated > 0 && (
          <span>
            <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{stats.unestimated}</span>{" "}
            {t("tasks.backlog.unestimated")}
          </span>
        )}

        <span>
          <span className="font-semibold text-foreground tabular-nums">{stats.totalPoints}</span>{" "}
          {t("tasks.backlog.pts")}
        </span>

        {/* Mini priority bar */}
        <div className="flex items-center gap-1.5">
          <div className="flex h-2 w-[100px] rounded-full overflow-hidden bg-muted">
            {PRIORITY_KEYS.map(key => {
              const count = stats.priorityCounts[key] ?? 0
              if (count === 0 || stats.total === 0) return null
              const pct = (count / stats.total) * 100
              const cfg = getPriorityConfig(key)
              return (
                <div
                  key={key}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${pct}%`, backgroundColor: cfg.hex }}
                  title={`${cfg.label}: ${count}`}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Bulk estimation (shown when selection active) ── */}
      {hasSelection && (
        <>
          <div className="w-px h-5 bg-border/60" />

          <div className="flex items-center gap-1">
            <span className="text-[11px] font-medium text-muted-foreground mr-1">{t("tasks.backlog.est")}</span>
            {FIBONACCI.map(n => (
              <button
                key={n}
                onClick={() => onBulkEstimate(ids, n)}
                className={cn(
                  "h-6 min-w-[28px] px-1.5 rounded-full text-xs font-semibold tabular-nums",
                  "bg-card border border-border/60 text-foreground",
                  "hover:bg-primary/10 hover:border-primary/30 hover:text-primary",
                  "transition-colors duration-150",
                )}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Priority bulk */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium rounded-lg">
                {t("tasks.backlog.sort.priority")}
                <ChevronDown className="size-3 ml-1 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px]">
              {PRIORITY_KEYS.map(priority => {
                const cfg = getPriorityConfig(priority)
                const Icon = cfg.icon
                return (
                  <DropdownMenuItem
                    key={priority}
                    onClick={() => onBulkPriority(ids, priority)}
                  >
                    <Icon className="size-3.5 mr-2 flex-shrink-0" style={{ color: cfg.hex }} />
                    {cfg.label}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Move to Sprint */}
          {targetSprints.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium rounded-lg">
                  <MoveRight className="size-3.5 mr-1" />
                  {t("tasks.backlog.moveToSprint")}
                  <ChevronDown className="size-3 ml-1 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px]">
                {targetSprints.map(sprint => (
                  <DropdownMenuItem
                    key={sprint.id}
                    onClick={() => onMoveToSprint(ids, sprint.id)}
                  >
                    <span className="truncate">{sprint.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {sprint.status === "ACTIVE" ? t("common.active") : t("tasks.backlog.planning")}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      )}

      {/* ── Sort controls ────────────────────────────────── */}
      <div className="w-px h-5 bg-border/60" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "h-7 px-2.5 flex items-center gap-1.5 rounded-lg text-xs font-medium",
              "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              "transition-colors duration-150",
            )}
          >
            <ArrowUpDown className="size-3" />
            {t(currentSortOption.labelKey)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[150px]">
          {SORT_OPTIONS.map(opt => {
            const Icon = opt.icon
            return (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => onSortFieldChange(opt.value)}
                className={cn(sortField === opt.value && "bg-accent font-medium")}
              >
                <Icon className="size-3.5 mr-2 text-muted-foreground" />
                {t(opt.labelKey)}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        onClick={() => onSortDirChange(sortDir === "asc" ? "desc" : "asc")}
        className={cn(
          "h-7 w-7 flex items-center justify-center rounded-lg",
          "text-muted-foreground hover:text-foreground hover:bg-accent/50",
          "transition-colors duration-150",
        )}
        title={sortDir === "asc" ? t("tasks.backlog.ascending") : t("tasks.backlog.descending")}
      >
        {sortDir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
      </button>
    </div>
  )
}

export const BacklogToolbar = React.memo(BacklogToolbarInner)

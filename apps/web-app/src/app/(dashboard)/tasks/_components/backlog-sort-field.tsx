"use client"

import { ArrowUpDown, Hash, AlertTriangle, Calendar, Type } from "lucide-react"
import type { Task, Sprint } from "@/lib/api"

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

export const FIBONACCI = [1, 2, 3, 5, 8, 13, 21] as const

export const SORT_OPTIONS: { value: BacklogSortField; labelKey: string; icon: typeof ArrowUpDown }[] = [
  { value: "priority", labelKey: "tasks.backlog.sort.priority", icon: AlertTriangle },
  { value: "createdAt", labelKey: "tasks.backlog.sort.createdAt", icon: Calendar },
  { value: "storyPoints", labelKey: "tasks.backlog.sort.storyPoints", icon: Hash },
  { value: "title", labelKey: "tasks.backlog.sort.title", icon: Type },
]

export const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

export const PRIORITY_KEYS = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const

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

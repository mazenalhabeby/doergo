import type { useQueryClient } from "@tanstack/react-query"
import { LayoutList, Kanban, CalendarDays } from "lucide-react"

import { keys } from "@/lib/query-keys"
import type { Task, TasksListResponse, Sprint, Phase, Epic } from "@/lib/api"
import type { StatusTabGroup } from "@/hooks/use-org-workflow"
import type { GroupByOption } from "../_components/grouped-list"
import type { TaskViewMode } from "../_components/tasks-skeleton"
import type { TaskContextMenuActions } from "../_components/task-context-menu"

// Priority sort order
export const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

// ─── Optimistic update helpers ──────────────────────────────────────────────

type QueryClient = ReturnType<typeof useQueryClient>

/** Snapshot all "tasks" query cache entries and return a restore function */
export function snapshotTasksCache(queryClient: QueryClient) {
  const queries = queryClient.getQueriesData<TasksListResponse>({ queryKey: keys.tasks.lists() })
  return queries // array of [queryKey, data] tuples
}

/** Apply a task-level update across every "tasks" cache entry */
export function optimisticUpdateTask(
  queryClient: QueryClient,
  taskId: string,
  updater: (task: Task) => Task,
) {
  queryClient.setQueriesData<TasksListResponse>(
    { queryKey: keys.tasks.lists() },
    (old) => {
      if (!old?.data) return old
      return {
        ...old,
        data: old.data.map((t) => (t.id === taskId ? updater(t) : t)),
      }
    },
  )
}

/** Restore all "tasks" cache entries from a previous snapshot */
export function restoreTasksCache(
  queryClient: QueryClient,
  // React Query keys are arrays of whatever the caller composed them from.
  snapshot: [readonly unknown[], TasksListResponse | undefined][],
) {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data)
  }
}

// Hardcoded fallback status tabs (used when no workflow is configured)
export const FALLBACK_STATUS_TABS: StatusTabGroup[] = [
  { key: "all", label: "All", dotColor: null, statuses: [] },
  { key: "open", label: "Open", dotColor: "#3B82F6", statuses: ["NEW"] },
  { key: "assigned", label: "Assigned", dotColor: "#8B5CF6", statuses: ["ASSIGNED", "ACCEPTED"] },
  { key: "active", label: "Active", dotColor: "#F59E0B", statuses: ["EN_ROUTE", "ARRIVED", "IN_PROGRESS"] },
  { key: "blocked", label: "Blocked", dotColor: "#EF4444", statuses: ["BLOCKED"] },
  { key: "done", label: "Done", dotColor: "#22C55E", statuses: ["COMPLETED", "CLOSED"] },
  { key: "canceled", label: "Canceled", dotColor: "#94A3B8", statuses: ["CANCELED"] },
]

// ViewMode + the storage key live with the skeleton that mirrors them.
export type ViewMode = TaskViewMode

export const GROUP_BY_STORAGE_KEY = "hbcfield-tasks-group-by"

/** Board and schedule show the whole workload at once; the server caps at 500. */
export const BOARD_FETCH_LIMIT = 500
export const GROUP_BY_OPTIONS: { value: GroupByOption; label: string }[] = [
  { value: "none", label: "None" },
  { value: "sprint", label: "Sprint" },
  { value: "epic", label: "Epic" },
  { value: "assignee", label: "Assignee" },
  { value: "priority", label: "Priority" },
  { value: "space", label: "Space" },
]

export const VIEW_OPTIONS: { mode: ViewMode; icon: typeof LayoutList; label: string }[] = [
  { mode: "board", icon: Kanban, label: "Board" },
  { mode: "table", icon: LayoutList, label: "List" },
  { mode: "schedule", icon: CalendarDays, label: "Schedule" },
]

export type TaskScope = "all" | "backlog" | string

/** What every view hands its rows and cards: the planning lists and the row actions. */
export interface TaskViewContext {
  sprints: Sprint[]
  phases: Phase[]
  epics: Epic[]
  spaces: { id: string; name: string }[]
  contextActions: TaskContextMenuActions
  recentAssignees: { id: string; firstName: string; lastName: string }[]
}

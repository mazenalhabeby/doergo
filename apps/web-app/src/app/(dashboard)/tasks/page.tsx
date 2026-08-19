"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Plus,
  Repeat,
  LayoutList,
  Kanban,
  CalendarDays,
  RefreshCw,
  Archive,
} from "lucide-react"
import { notify } from "@/lib/toast"

import { useAuth } from "@/contexts/auth-context"
import { useCommandPalette, type CommandAction } from "@/contexts/command-palette-context"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { useOrgWorkflow, useWorkflow, buildStatusTabs, buildKanbanColumns, type StatusTabGroup } from "@/hooks/use-org-workflow"
import { useSpaceWorkflow } from "@/hooks/use-space-modules"
import { tasksApi, phasesApi, sprintsApi, epicsApi, locationsApi, type Task, type Phase, type Sprint, type Epic, type TasksListResponse } from "@/lib/api"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { AssignMemberDialog } from "@/components/assign-member-dialog"
import {
  TasksViewSkeleton,
  VIEW_MODE_STORAGE_KEY,
  readStoredViewMode,
  type TaskViewMode,
} from "./_components/tasks-skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { TaskTableRow } from "./_components/task-table-row"
import { KanbanBoard } from "./_components/kanban-board"
import { GroupedList, type GroupByOption } from "./_components/grouped-list"
import { TimelineView } from "./_components/timeline-view"
import { CalendarView } from "./_components/calendar-view"
import { EpicRoadmap } from "./_components/epic-roadmap"
import { CreateTaskDialog } from "./_components/create-task-dialog"
import { RecurringPanel } from "./recurring/recurring-view"
import { BulkActionBar } from "./_components/bulk-action-bar"
import { BacklogToolbar, sortBacklogTasks, type BacklogSortField, type BacklogSortDir } from "./_components/backlog-toolbar"
import { SprintCapacityBar } from "./_components/sprint-capacity"
import { SprintFormDialog, CompleteSprintDialog, DeleteSprintDialog, EpicFormDialog } from "./_components/sprint-management"
import type { TaskContextMenuActions } from "./_components/task-context-menu"
import { hasAccessModule, mayChangeStatus, isFinishedStatus, STATUS_TRANSITIONS } from "@hbcfield/shared/client"

// Priority sort order
const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

// ─── Optimistic update helpers ──────────────────────────────────────────────

/** Snapshot all "tasks" query cache entries and return a restore function */
function snapshotTasksCache(queryClient: ReturnType<typeof useQueryClient>) {
  const queries = queryClient.getQueriesData<TasksListResponse>({ queryKey: ["tasks"] })
  return queries // array of [queryKey, data] tuples
}

/** Apply a task-level update across every "tasks" cache entry */
function optimisticUpdateTask(
  queryClient: ReturnType<typeof useQueryClient>,
  taskId: string,
  updater: (task: Task) => Task,
) {
  queryClient.setQueriesData<TasksListResponse>(
    { queryKey: ["tasks"] },
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
function restoreTasksCache(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshot: [any, TasksListResponse | undefined][],
) {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data)
  }
}

// Hardcoded fallback status tabs (used when no workflow is configured)
const FALLBACK_STATUS_TABS: StatusTabGroup[] = [
  { key: "all", label: "All", dotColor: null, statuses: [] },
  { key: "open", label: "Open", dotColor: "#3B82F6", statuses: ["NEW"] },
  { key: "assigned", label: "Assigned", dotColor: "#8B5CF6", statuses: ["ASSIGNED", "ACCEPTED"] },
  { key: "active", label: "Active", dotColor: "#F59E0B", statuses: ["EN_ROUTE", "ARRIVED", "IN_PROGRESS"] },
  { key: "blocked", label: "Blocked", dotColor: "#EF4444", statuses: ["BLOCKED"] },
  { key: "done", label: "Done", dotColor: "#22C55E", statuses: ["COMPLETED", "CLOSED"] },
  { key: "canceled", label: "Canceled", dotColor: "#94A3B8", statuses: ["CANCELED"] },
]

// ViewMode + the storage key live with the skeleton that mirrors them.
type ViewMode = TaskViewMode

const GROUP_BY_STORAGE_KEY = "hbcfield-tasks-group-by"

/** Board and schedule show the whole workload at once; the server caps at 500. */
const BOARD_FETCH_LIMIT = 500
const GROUP_BY_OPTIONS: { value: GroupByOption; label: string }[] = [
  { value: "none", label: "None" },
  { value: "sprint", label: "Sprint" },
  { value: "epic", label: "Epic" },
  { value: "assignee", label: "Assignee" },
  { value: "priority", label: "Priority" },
  { value: "space", label: "Space" },
]

const VIEW_OPTIONS: { mode: ViewMode; icon: typeof LayoutList; label: string }[] = [
  { mode: "board", icon: Kanban, label: "Board" },
  { mode: "table", icon: LayoutList, label: "List" },
  { mode: "schedule", icon: CalendarDays, label: "Schedule" },
]

type TaskScope = "all" | "backlog" | string

const SPRINT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  PLANNING: "Planning",
  COMPLETED: "Completed",
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { user, hasModule, hasPlanFeature } = useAuth()
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const router = useRouter()
  const { registerActions, unregisterActions } = useCommandPalette()

  // Ref for focusing search input via keyboard shortcut
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Filter states
  const [searchQuery, setSearchQuery] = useState("")
  // The input stays instant; only the settled value drives the query.
  const debouncedSearch = useDebouncedValue(searchQuery, 300)
  const [activeTab, setActiveTab] = useState(
    searchParams.get("tab") || "all"
  )
  // Same reader the route-level skeleton uses, so the placeholder and the page
  // always open on the same view.
  const [viewMode, setViewMode] = useState<ViewMode>(readStoredViewMode)

  const [groupBy, setGroupBy] = useState<GroupByOption>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(GROUP_BY_STORAGE_KEY)
      if (stored && ["none", "sprint", "epic", "assignee", "priority", "space"].includes(stored)) {
        return stored as GroupByOption
      }
    }
    return "none"
  })
  const [page, setPage] = useState(1)
  const limit = 20

  // Sprint scope state
  const [scope, setScope] = useState<TaskScope>("all")
  // Epic filter state
  const [epicFilter, setEpicFilter] = useState<string>("all")
  // Space filter state
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(
    searchParams.get("space") || null
  )

  // Backlog sort state
  const [backlogSortField, setBacklogSortField] = useState<BacklogSortField>("priority")
  const [backlogSortDir, setBacklogSortDir] = useState<BacklogSortDir>("asc")

  // Sprint CRUD state
  const [sprintFormOpen, setSprintFormOpen] = useState(false)
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null)
  const [completingSprint, setCompletingSprint] = useState<Sprint | null>(null)
  const [deletingSprintId, setDeletingSprintId] = useState<string | null>(null)

  // Epic CRUD state
  const [epicFormOpen, setEpicFormOpen] = useState(false)
  const [editingEpic, setEditingEpic] = useState<Epic | null>(null)

  // Persist view mode
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
    // Clear epic filter when leaving schedule view (roadmap lives there)
    if (mode !== "schedule") setEpicFilter("all")
  }, [])

  // Persist group-by
  const handleGroupByChange = useCallback((value: GroupByOption) => {
    setGroupBy(value)
    localStorage.setItem(GROUP_BY_STORAGE_KEY, value)
  }, [])

  // Bulk selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const lastSelectedIndexRef = useRef<number | null>(null)
  const filteredTasksRef = useRef<Task[]>([])

  const handleClearSelection = useCallback(() => {
    setSelectedTaskIds(new Set())
    lastSelectedIndexRef.current = null
  }, [])

  const handleToggleSelect = useCallback((taskId: string, shiftKey: boolean) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev)
      const currentTasks = filteredTasksRef.current

      if (shiftKey && lastSelectedIndexRef.current !== null) {
        const currentIndex = currentTasks.findIndex((t: Task) => t.id === taskId)
        if (currentIndex >= 0) {
          const start = Math.min(lastSelectedIndexRef.current, currentIndex)
          const end = Math.max(lastSelectedIndexRef.current, currentIndex)
          for (let i = start; i <= end; i++) {
            const t = currentTasks[i]
            if (t) next.add(t.id)
          }
        }
      } else {
        if (next.has(taskId)) {
          next.delete(taskId)
        } else {
          next.add(taskId)
        }
      }

      const idx = currentTasks.findIndex((t: Task) => t.id === taskId)
      if (idx >= 0) lastSelectedIndexRef.current = idx

      return next
    })
  }, [])

  // Create task dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [recurringView, setRecurringView] = useState(false)

  // Assign dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  // Dynamic workflow status tabs — space- AND task-type-aware.
  // A space can hold tasks of several types (workflows); the Task Type picker
  // below chooses which one the board/tabs reflect, defaulting to the space's
  // (or org's) default. Everything downstream reads `activeWorkflowStatuses`.
  const { workflows: orgWorkflows, defaultWorkflow } = useOrgWorkflow()
  const { workflowId: spaceWorkflowId } = useSpaceWorkflow(selectedSpaceId)
  const contextDefaultWorkflowId = (selectedSpaceId ? spaceWorkflowId : null) ?? defaultWorkflow?.id ?? null
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const activeWorkflowId = selectedWorkflowId ?? contextDefaultWorkflowId
  const { statuses: activeWorkflowStatuses, hasWorkflow } = useWorkflow(activeWorkflowId)
  const STATUS_TABS: StatusTabGroup[] = useMemo(() => {
    if (hasWorkflow && activeWorkflowStatuses.length > 0) {
      return buildStatusTabs(activeWorkflowStatuses)
    }
    return FALLBACK_STATUS_TABS
  }, [hasWorkflow, activeWorkflowStatuses])

  // Derive the API status filter from the active tab

  // The statuses behind the active tab. Sent as a group, because a tab like
  // "active" covers several statuses and the server takes a list.
  const activeStatuses = useMemo(() => {
    const tab = STATUS_TABS.find((t) => t.key === activeTab)
    return !tab || tab.key === "all" ? undefined : tab.statuses
  }, [activeTab, STATUS_TABS])

  // Board and schedule show the whole workload at once — a kanban column that
  // says "Done 0" because the finished tasks are on page 3 is worse than no
  // count. The table keeps real pagination.
  const paginated = viewMode === "table"
  const effectiveLimit = paginated ? limit : BOARD_FETCH_LIMIT

  // Fetch tasks. Every filter below is applied by the SERVER: filtering in the
  // browser only ever filtered the page that happened to be loaded, so a search
  // missed anything past row 20 and the totals described a different set than
  // the rows did.
  const taskQueryParams = useMemo(
    () => ({
      statuses: activeStatuses,
      search: debouncedSearch,
      spaceId: selectedSpaceId || undefined,
      sprintId: scope === "all" ? undefined : scope === "backlog" ? "none" : scope,
      epicId: epicFilter === "all" ? undefined : epicFilter,
      page: paginated ? page : 1,
      limit: effectiveLimit,
    }),
    [activeStatuses, debouncedSearch, selectedSpaceId, scope, epicFilter, page, paginated, effectiveLimit],
  )

  const { data: tasksData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["tasks", taskQueryParams],
    queryFn: () => tasksApi.list(taskQueryParams),
    placeholderData: (prev) => prev, // keep rows on screen while a filter re-fetches
  })

  // Space tab counts, grouped server-side over everything the viewer may see.
  // Computed from the loaded page before, which is why the same tab showed 7 on
  // page 1 and 4 on page 2.
  const { data: spaceCounts } = useQuery({
    queryKey: ["taskStatusCounts", "space"],
    queryFn: () => tasksApi.getStatusCounts({ groupBy: "space" }),
    staleTime: 30000,
  })

  // Fetch status counts

  // Fetch phases
  const { data: phases } = useQuery({
    queryKey: ["phases"],
    queryFn: () => phasesApi.list(),
    staleTime: 60000,
  })

  // Fetch sprints
  const { data: sprints } = useQuery({
    queryKey: ["sprints"],
    queryFn: () => sprintsApi.list(),
    staleTime: 60000,
  })

  // Fetch epics
  const { data: epics } = useQuery({
    queryKey: ["epics"],
    queryFn: () => epicsApi.list(),
    staleTime: 60000,
  })

  // Fetch spaces (company locations)
  const { data: spacesData } = useQuery({
    queryKey: ["locations"],
    queryFn: () => locationsApi.list(),
    staleTime: 60000,
  })
  const allSpaces = spacesData?.data || []

  // Role-based space filtering:
  // Admin/Dispatcher → all spaces
  // Employee → only spaces from their assigned tasks
  const isAdminOrManager = user?.role === "ADMIN" || !!user?.canViewAllTasks
  const spaces = useMemo(() => {
    if (isAdminOrManager) return allSpaces
    // Filter to spaces the employee has tasks in
    const taskList = tasksData?.data || []
    const userSpaceIds = new Set(taskList.filter((t: any) => t.spaceId).map((t: any) => t.spaceId))
    if (userSpaceIds.size === 0) return allSpaces
    return (allSpaces as any[]).filter((s: any) => userSpaceIds.has(s.id))
  }, [isAdminOrManager, allSpaces, tasksData])

  // Space-aware modules
  const { hasModule: spaceHasModule } = useSpaceModules(selectedSpaceId)
  // Use space-level hasModule when a space is selected, otherwise org-level
  const effectiveHasModule = selectedSpaceId ? spaceHasModule : hasModule

  // Space change handler
  const handleSpaceChange = useCallback((spaceId: string | null) => {
    setSelectedSpaceId(spaceId)
    setPage(1)
    setActiveTab("all") // Reset tab since workflow changes per space
    setSelectedWorkflowId(null) // Reset task-type picker to the new space's default
    setEpicFilter("all") // Reset epic filter — different space has different epics
    // Update URL
    const url = spaceId ? `/tasks?space=${spaceId}` : "/tasks"
    router.replace(url, { scroll: false })
  }, [router])

  // Sprint mutations
  const startSprintMutation = useMutation({
    mutationFn: (id: string) => sprintsApi.start(id),
    onSuccess: () => {
      notify.sprint("started", t("tasks.notify.sprintStarted"))
      queryClient.invalidateQueries({ queryKey: ["sprints"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const completeSprintMutation = useMutation({
    mutationFn: (id: string) => sprintsApi.complete(id),
    onSuccess: () => {
      notify.sprint("completed", t("tasks.notify.sprintCompleted"))
      setCompletingSprint(null)
      setScope("all")
      queryClient.invalidateQueries({ queryKey: ["sprints"] })
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteSprintMutation = useMutation({
    mutationFn: (id: string) => sprintsApi.delete(id),
    onSuccess: () => {
      notify.sprint("deleted", t("tasks.notify.sprintRemoved"))
      setDeletingSprintId(null)
      setScope("all")
      queryClient.invalidateQueries({ queryKey: ["sprints"] })
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  // Sprint helpers
  const effectiveSprints = useMemo(() => {
    return [...(sprints || [])].sort((a, b) => {
      const order: Record<string, number> = { ACTIVE: 0, PLANNING: 1, COMPLETED: 2 }
      return (order[a.status] ?? 9) - (order[b.status] ?? 9)
    })
  }, [sprints])

  const hasActiveSprint = useMemo(() => effectiveSprints.some(s => s.status === "ACTIVE"), [effectiveSprints])

  const nextPlanningSprint = useMemo(() =>
    effectiveSprints.find(s => s.status === "PLANNING") ?? null
  , [effectiveSprints])

  const nextSprintNumber = (sprints || []).length + 1
  const lastSprintEndDate = useMemo(() => {
    const sorted = [...(sprints || [])].sort((a, b) =>
      new Date(b.endDate).getTime() - new Date(a.endDate).getTime()
    )
    return sorted[0]?.endDate ?? null
  }, [sprints])

  const selectedSprint = useMemo(() => {
    if (scope === "all" || scope === "backlog") return null
    return effectiveSprints.find(s => s.id === scope) ?? null
  }, [scope, effectiveSprints])

  const handleSprintFormClose = useCallback((open: boolean) => {
    setSprintFormOpen(open)
    if (!open) setEditingSprint(null)
  }, [])

  const handleEditSprint = useCallback((sprint: Sprint) => {
    setEditingSprint(sprint)
    setSprintFormOpen(true)
  }, [])

  const handleCompleteSprintClick = useCallback((sprint: Sprint) => {
    setCompletingSprint(sprint)
  }, [])

  const handleCompleteSprintConfirm = useCallback((_moveToNext: boolean) => {
    if (completingSprint) {
      completeSprintMutation.mutate(completingSprint.id)
    }
  }, [completingSprint, completeSprintMutation])

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: (workerId: string) => {
      if (!selectedTaskId) throw new Error(t("tasks.notify.noTaskSelected"))
      return tasksApi.assign(selectedTaskId, workerId)
    },
    onMutate: async (workerId) => {
      if (!selectedTaskId) return
      await queryClient.cancelQueries({ queryKey: ["tasks"] })
      const snapshot = snapshotTasksCache(queryClient)
      optimisticUpdateTask(queryClient, selectedTaskId, (t) => ({
        ...t,
        assignedToId: workerId,
        status: t.status === "NEW" ? "ASSIGNED" : t.status,
      }))
      return { snapshot }
    },
    onError: (e: Error, _vars, context) => {
      if (context?.snapshot) restoreTasksCache(queryClient, context.snapshot)
      notify.error(e.message)
    },
    onSuccess: () => {
      notify.success(t("tasks.notify.memberAssigned"))
    },
    onSettled: () => {
      // Always refetch to sync with server
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"], refetchType: "all" })
    },
  })

  const handleAssignClick = (taskId: string) => {
    setSelectedTaskId(taskId)
    setAssignDialogOpen(true)
  }

  const handleRefresh = () => {
    refetch()
    queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"] })
  }

  const tasks = tasksData?.data || []
  const meta = tasksData?.meta
  const effectivePhases = phases || []
  const effectiveEpics = epics || []

  // ── Smart board task-type picker ──────────────────────────────────────────
  // Only offer the workflows that the space's tasks ACTUALLY use (a task's type
  // is its own workflowId, else the space default) — not every org workflow. The
  // board renders one type at a time (columns differ per workflow); default to the
  // space's own type when present, else the first type that has tasks here.
  const boardWorkflowCounts = useMemo(() => {
    const scoped = selectedSpaceId ? tasks.filter((t: Task) => t.spaceId === selectedSpaceId) : tasks
    const m = new Map<string, number>()
    for (const tk of scoped) {
      const wf = (tk as Task).workflowId ?? contextDefaultWorkflowId
      if (wf) m.set(wf, (m.get(wf) ?? 0) + 1)
    }
    return m
  }, [tasks, selectedSpaceId, contextDefaultWorkflowId])
  const presentWorkflowIds = useMemo(() => new Set(boardWorkflowCounts.keys()), [boardWorkflowCounts])
  const boardWorkflows = useMemo(
    () => orgWorkflows.filter((w) => presentWorkflowIds.has(w.id)),
    [orgWorkflows, presentWorkflowIds],
  )
  const boardWorkflowId = useMemo(() => {
    if (selectedWorkflowId && presentWorkflowIds.has(selectedWorkflowId)) return selectedWorkflowId
    if (contextDefaultWorkflowId && presentWorkflowIds.has(contextDefaultWorkflowId)) return contextDefaultWorkflowId
    return boardWorkflows[0]?.id ?? contextDefaultWorkflowId ?? activeWorkflowId
  }, [selectedWorkflowId, presentWorkflowIds, contextDefaultWorkflowId, boardWorkflows, activeWorkflowId])
  const { statuses: boardStatuses, hasWorkflow: boardHasWorkflow } = useWorkflow(boardWorkflowId)
  const boardKanbanColumns = useMemo(
    () => (boardHasWorkflow && boardStatuses.length > 0 ? buildKanbanColumns(boardStatuses) : undefined),
    [boardHasWorkflow, boardStatuses],
  )

  // Kanban drag-and-drop status change
  const statusChangeMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      tasksApi.updateStatus(taskId, status),
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] })
      const snapshot = snapshotTasksCache(queryClient)
      optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, status }))
      return { snapshot }
    },
    onError: (e: Error, _vars, context) => {
      if (context?.snapshot) restoreTasksCache(queryClient, context.snapshot)
      notify.error(e.message)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"], refetchType: "all" })
    },
  })

  const handleKanbanDrop = useCallback((taskId: string, newStatus: string) => {
    const task = tasks.find(t => t.id === taskId)
    // Don't do anything if dropping on the same status
    if (task && task.status === newStatus) return

    /*
      Refuse a move the server would refuse, here rather than after a round
      trip. A card lifts only when it can move at all, but WHERE it may land is
      a second question: a completed task may be closed and nothing else, so
      dropping it in "In Progress" should not travel and come back as an error.
      Same rule the service applies.
    */
    if (task && !mayChangeStatus({
      from: task.status,
      to: newStatus,
      allowedTargets: (STATUS_TRANSITIONS[task.status as keyof typeof STATUS_TRANSITIONS] ?? []) as string[],
      targetIsValidStatus: true,
      isManager: user?.role === "ADMIN" || user?.canViewAllTasks === true,
      fromIsFinished: isFinishedStatus(task.status),
    })) {
      notify.error(t("tasks.notify.invalidTransition", {
        defaultValue: "This task can no longer be moved there.",
      }))
      return
    }

    statusChangeMutation.mutate({ taskId, status: newStatus })
  }, [tasks, statusChangeMutation, user, t])

  // Handle reorder within same column/group
  const handleReorder = useCallback((taskId: string, newPosition: number, _groupKey: string) => {
    // Real API: optimistic position update
    const snapshot = snapshotTasksCache(queryClient)
    optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, position: newPosition }))
    tasksApi.update(taskId, { position: newPosition }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
    }).catch((e: Error) => {
      restoreTasksCache(queryClient, snapshot)
      notify.error(e.message)
    })
  }, [queryClient])

  // Handle cross-group change (drag between groups in grouped list)
  const handleGroupChange = useCallback((taskId: string, updates: Record<string, string | null>) => {
    // Optimistic update for cross-group drag
    const snapshot = snapshotTasksCache(queryClient)
    optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, ...updates }))
    const field = Object.keys(updates)[0] || "field"
    tasksApi.update(taskId, updates).then(() => {
      notify.success(t("tasks.notify.taskFieldUpdated", { field: field.replace("Id", "") }))
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["sprints"] })
    }).catch((e: Error) => {
      restoreTasksCache(queryClient, snapshot)
      notify.error(e.message)
    })
  }, [queryClient])

  // Context menu actions
  const contextActions: TaskContextMenuActions = useMemo(() => ({
    onStatusChange: (taskId: string, status: string) => {
      statusChangeMutation.mutate({ taskId, status })
    },
    onPriorityChange: (taskId: string, priority: string) => {
      const snapshot = snapshotTasksCache(queryClient)
      optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, priority }))
      tasksApi.update(taskId, { priority }).then(() => {
        notify.success(t("tasks.notify.priorityUpdated"))
        queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      }).catch((e: Error) => {
        restoreTasksCache(queryClient, snapshot)
        notify.error(e.message)
      })
    },
    onSprintChange: (taskId: string, sprintId: string | null) => {
      const snapshot = snapshotTasksCache(queryClient)
      optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, sprintId }))
      tasksApi.update(taskId, { sprintId }).then(() => {
        notify.success(sprintId ? t("tasks.notify.movedToSprint") : t("tasks.notify.movedToBacklog"))
        queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
        queryClient.invalidateQueries({ queryKey: ["sprints"] })
      }).catch((e: Error) => {
        restoreTasksCache(queryClient, snapshot)
        notify.error(e.message)
      })
    },
    onPhaseChange: (taskId: string, phaseId: string | null) => {
      const snapshot = snapshotTasksCache(queryClient)
      optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, phaseId }))
      tasksApi.update(taskId, { phaseId }).then(() => {
        notify.success(phaseId ? t("tasks.notify.phaseSet") : t("tasks.notify.phaseRemoved"))
        queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      }).catch((e: Error) => {
        restoreTasksCache(queryClient, snapshot)
        notify.error(e.message)
      })
    },
    onEpicChange: (taskId: string, epicId: string | null) => {
      const snapshot = snapshotTasksCache(queryClient)
      optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, epicId }))
      tasksApi.update(taskId, { epicId }).then(() => {
        notify.success(epicId ? t("tasks.notify.epicSet") : t("tasks.notify.epicRemoved"))
        queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      }).catch((e: Error) => {
        restoreTasksCache(queryClient, snapshot)
        notify.error(e.message)
      })
    },
    onStoryPointsChange: (taskId: string, points: number | null) => {
      const snapshot = snapshotTasksCache(queryClient)
      optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, storyPoints: points }))
      tasksApi.update(taskId, { storyPoints: points }).then(() => {
        notify.success(points ? t("tasks.notify.pointsSet", { points }) : t("tasks.notify.pointsCleared"))
        queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      }).catch((e: Error) => {
        restoreTasksCache(queryClient, snapshot)
        notify.error(e.message)
      })
    },
    onSpaceChange: (taskId: string, spaceId: string | null) => {
      const snapshot = snapshotTasksCache(queryClient)
      optimisticUpdateTask(queryClient, taskId, (t) => ({ ...t, spaceId }))
      tasksApi.update(taskId, { spaceId }).then(() => {
        notify.success(spaceId ? t("tasks.notify.movedToSpace") : t("tasks.notify.spaceRemoved"))
        queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      }).catch((e: Error) => {
        restoreTasksCache(queryClient, snapshot)
        notify.error(e.message)
      })
    },
    onDelete: (taskId: string) => {
      const snapshot = snapshotTasksCache(queryClient)
      // Optimistically remove task from cache
      queryClient.setQueriesData<TasksListResponse>(
        { queryKey: ["tasks"] },
        (old) => {
          if (!old?.data) return old
          return {
            ...old,
            data: old.data.filter((t) => t.id !== taskId),
            meta: old.meta ? { ...old.meta, total: old.meta.total - 1 } : old.meta,
          }
        },
      )
      tasksApi.delete(taskId).then(() => {
        notify.success(t("tasks.notify.taskDeleted"))
        queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
        queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"], refetchType: "all" })
      }).catch((e: Error) => {
        restoreTasksCache(queryClient, snapshot)
        notify.error(e.message)
      })
    },
  }), [statusChangeMutation, queryClient])

  // Build recent assignees from visible tasks for context menu
  const recentAssignees = useMemo(() => {
    const map = new Map<string, { id: string; firstName: string; lastName: string }>()
    for (const task of tasks) {
      if (task.assignedTo) {
        map.set(task.assignedTo.id, {
          id: task.assignedTo.id,
          firstName: task.assignedTo.firstName ?? "",
          lastName: task.assignedTo.lastName ?? "",
        })
      }
      if (task.assignees) {
        for (const a of task.assignees) {
          map.set(a.user.id, {
            id: a.user.id,
            firstName: a.user.firstName ?? "",
            lastName: a.user.lastName ?? "",
          })
        }
      }
    }
    return Array.from(map.values()).slice(0, 8)
  }, [tasks])

  // Bulk action handlers
  const handleBulkStatusChange = useCallback((taskIds: string[], status: string) => {
    Promise.allSettled(taskIds.map(id => tasksApi.updateStatus(id, status)))
      .then((results) => {
        const failed = results.filter(r => r.status === "rejected").length
        if (failed > 0) notify.error(t("tasks.notify.updatesFailed", { failed, total: taskIds.length }))
        else notify.bulk(taskIds.length, t("tasks.notify.actionUpdated"))
        handleClearSelection()
        queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
        queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"], refetchType: "all" })
      })
  }, [handleClearSelection, queryClient])

  const handleBulkPriorityChange = useCallback((taskIds: string[], priority: string) => {
    Promise.allSettled(taskIds.map(id => tasksApi.update(id, { priority })))
      .then((results) => {
        const failed = results.filter(r => r.status === "rejected").length
        if (failed > 0) notify.error(t("tasks.notify.updatesFailed", { failed, total: taskIds.length }))
        else notify.bulk(taskIds.length, t("tasks.notify.actionUpdated"))
        handleClearSelection()
        queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      })
  }, [handleClearSelection, queryClient])

  const handleBulkSprintChange = useCallback((taskIds: string[], sprintId: string | null) => {
    Promise.allSettled(taskIds.map(id => tasksApi.update(id, { sprintId })))
      .then((results) => {
        const failed = results.filter(r => r.status === "rejected").length
        if (failed > 0) notify.error(t("tasks.notify.updatesFailed", { failed, total: taskIds.length }))
        else notify.bulk(taskIds.length, t("tasks.notify.actionMoved"))
        handleClearSelection()
        queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
        queryClient.invalidateQueries({ queryKey: ["sprints"] })
      })
  }, [handleClearSelection, queryClient])

  const handleBulkDelete = useCallback((taskIds: string[]) => {
    Promise.allSettled(taskIds.map(id => tasksApi.delete(id)))
      .then((results) => {
        const failed = results.filter(r => r.status === "rejected").length
        if (failed > 0) notify.error(t("tasks.notify.deletesFailed", { failed, total: taskIds.length }))
        else notify.bulk(taskIds.length, t("tasks.notify.actionDeleted"))
        handleClearSelection()
        queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
        queryClient.invalidateQueries({ queryKey: ["taskStatusCounts"], refetchType: "all" })
      })
  }, [handleClearSelection, queryClient])

  const handleBulkEstimate = useCallback((taskIds: string[], points: number) => {
    Promise.allSettled(taskIds.map(id => tasksApi.update(id, { storyPoints: points })))
      .then((results) => {
        const failed = results.filter(r => r.status === "rejected").length
        if (failed > 0) notify.error(t("tasks.notify.updatesFailed", { failed, total: taskIds.length }))
        else notify.bulk(taskIds.length, t("tasks.notify.actionEstimated"))
        handleClearSelection()
        queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      })
  }, [handleClearSelection, queryClient])

  const handleBulkSpaceChange = useCallback((taskIds: string[], spaceId: string | null) => {
    Promise.allSettled(taskIds.map(id => tasksApi.update(id, { spaceId })))
      .then((results) => {
        const failed = results.filter(r => r.status === "rejected").length
        if (failed > 0) notify.error(t("tasks.notify.updatesFailed", { failed, total: taskIds.length }))
        else notify.bulk(taskIds.length, t("tasks.notify.actionMoved"))
        handleClearSelection()
        queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
      })
  }, [handleClearSelection, queryClient])

  // Any filter change invalidates the page number: page 3 of an unfiltered list
  // is not page 3 of a filtered one, and asking for it returns an empty screen.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, selectedSpaceId, scope, epicFilter, activeTab])

  // Space tab counts — server-grouped over everything visible, not the page.
  const spaceTaskCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const [spaceId, n] of Object.entries(spaceCounts ?? {})) {
      if (spaceId !== "all") counts.set(spaceId, n as number)
    }
    return counts
  }, [spaceCounts])

  // Sorting only. Space, sprint, epic, status-group and search are applied by
  // the server now — see taskQueryParams. Filtering here as well would narrow
  // an already-correct page and quietly reintroduce the bug this replaced.
  const filteredTasks = useMemo(() => {
    if (scope === "backlog") {
      return sortBacklogTasks(tasks, backlogSortField, backlogSortDir)
    }
    return [...tasks].sort((a: Task, b: Task) => {
      const orderA = PRIORITY_ORDER[a.priority] ?? 99
      const orderB = PRIORITY_ORDER[b.priority] ?? 99
      return orderA - orderB
    })
  }, [tasks, scope, backlogSortField, backlogSortDir])

  // Tasks in the selected sprint (unfiltered — for sprint indicator)
  const sprintScopedTasks = useMemo(() => {
    if (scope === "all" || scope === "backlog") return []
    return tasks.filter((t: Task) => t.sprintId === scope)
  }, [tasks, scope])

  // Incomplete tasks in selected sprint (for complete sprint dialog)
  const incompleteSprintTasks = useMemo(() => {
    return sprintScopedTasks.filter((t: Task) => !["COMPLETED", "CLOSED", "CANCELED"].includes(t.status))
  }, [sprintScopedTasks])

  // Board-only view: when the org has multiple task types, the kanban shows one
  // type at a time (columns differ per workflow), so scope its cards to the active
  // type. A task's effective type is its own workflowId, else the space default.
  // Other views (table/schedule) keep showing everything.
  const boardTasks = useMemo(() => {
    if (boardWorkflows.length <= 1 || !boardWorkflowId) return filteredTasks
    return filteredTasks.filter(
      (tk: Task) => ((tk.workflowId ?? contextDefaultWorkflowId) === boardWorkflowId),
    )
  }, [filteredTasks, boardWorkflows.length, boardWorkflowId, contextDefaultWorkflowId])

  // Sync ref for shift-click range selection
  filteredTasksRef.current = filteredTasks

  const handleSelectAll = useCallback(() => {
    setSelectedTaskIds(prev => {
      if (prev.size === filteredTasksRef.current.length) {
        return new Set()
      }
      return new Set(filteredTasksRef.current.map((t: Task) => t.id))
    })
  }, [])

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    setPage(1)
  }

  // Pagination
  const totalPages = meta?.totalPages || 1
  const total = meta?.total || 0

  // Create requires BOTH the permission and the create_task access module.
  const canCreateTasks = (user?.canCreateTasks ?? false) && hasAccessModule(user ?? {}, "create_task")
  const canAssignTasks = user?.canAssignTasks ?? false

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useKeyboardShortcuts(
    {
      onCreateTask: canCreateTasks ? () => setCreateDialogOpen(true) : undefined,
      onSearch: () => searchInputRef.current?.focus(),
      onViewChange: (view) => handleViewModeChange(view as ViewMode),
      onClearSelection: handleClearSelection,
    },
    { enableTaskShortcuts: true, navigate: (path) => router.push(path) },
  )

  // ── Register task-specific commands with command palette ────────────────────
  useEffect(() => {
    const taskActions: CommandAction[] = []

    if (canCreateTasks) {
      taskActions.push({
        id: "task-create",
        label: "Create New Task",
        description: "Open the create task dialog",
        icon: Plus,
        group: "tasks",
        shortcut: "C",
        onSelect: () => setCreateDialogOpen(true),
        contextual: true,
      })
    }

    taskActions.push({
      id: "task-search",
      label: "Search Tasks",
      description: "Focus the task search input",
      icon: Search,
      group: "tasks",
      shortcut: "/",
      onSelect: () => searchInputRef.current?.focus(),
      contextual: true,
    })

    // Sprint actions
    taskActions.push({
      id: "sprint-create",
      label: "Create Sprint",
      description: "Open the sprint form dialog",
      icon: Plus,
      group: "sprints",
      onSelect: () => { setEditingSprint(null); setSprintFormOpen(true) },
      contextual: true,
    })

    taskActions.push({
      id: "sprint-backlog",
      label: "View Backlog",
      description: "Show tasks not assigned to any sprint",
      icon: Archive,
      group: "sprints",
      onSelect: () => { setScope("backlog"); setPage(1) },
      contextual: true,
    })

    // Space navigation actions
    for (const space of spaces) {
      taskActions.push({
        id: `space-${space.id}`,
        label: `Go to ${space.name} tasks`,
        description: `Filter tasks by ${space.name} space`,
        icon: ClipboardList,
        group: "tasks",
        onSelect: () => handleSpaceChange(space.id),
        contextual: true,
      })
    }

    const ids = taskActions.map((a) => a.id)
    registerActions(taskActions)
    return () => unregisterActions(ids)
  }, [canCreateTasks, spaces, handleSpaceChange, registerActions, unregisterActions]) // eslint-disable-line react-hooks/exhaustive-deps

  // Available group-by options based on modules
  const availableGroupByOptions = useMemo(() => {
    return GROUP_BY_OPTIONS.filter(opt => {
      if (opt.value === "none") return true
      if (opt.value === "sprint") return effectiveHasModule('sprints')
      if (opt.value === "epic") return effectiveHasModule('epics') && effectiveEpics.length > 0
      if (opt.value === "assignee") return false // removed from list groups
      if (opt.value === "priority") return true
      if (opt.value === "space") return false // spaces handled by tabs above
      return true
    })
  }, [effectiveHasModule, effectiveEpics.length, selectedSpaceId, spaces.length])

  // Reset group-by when current option is not available for the selected space
  useEffect(() => {
    if (groupBy !== "none" && !availableGroupByOptions.some(o => o.value === groupBy)) {
      setGroupBy("none")
    }
  }, [availableGroupByOptions, groupBy])

  // Group-by dropdown label
  const groupByLabel = useMemo(() => {
    if (groupBy === "none") return "Group: None"
    const opt = GROUP_BY_OPTIONS.find(o => o.value === groupBy)
    return `Group: ${opt?.label ?? groupBy}`
  }, [groupBy])

  // Current view label
  const currentViewOption = VIEW_OPTIONS.find(v => v.mode === viewMode) || VIEW_OPTIONS[0]!
  const CurrentViewIcon = currentViewOption.icon

  // Sprint dropdown label
  const sprintDropdownLabel = useMemo(() => {
    if (scope === "all") return "All Tasks"
    if (scope === "backlog") return "Backlog"
    const s = effectiveSprints.find(s => s.id === scope)
    return s?.name ?? "Sprint"
  }, [scope, effectiveSprints])

  // Sprint indicator data
  const sprintIndicator = useMemo(() => {
    if (!selectedSprint) return null
    const taskCount = sprintScopedTasks.length
    const doneCount = sprintScopedTasks.filter((t: Task) => t.status === "COMPLETED" || t.status === "CLOSED").length
    const totalPoints = sprintScopedTasks.reduce((sum: number, t: Task) => sum + (t.storyPoints || 0), 0)
    const donePoints = sprintScopedTasks.filter((t: Task) => t.status === "COMPLETED" || t.status === "CLOSED").reduce((sum: number, t: Task) => sum + (t.storyPoints || 0), 0)
    const pct = taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0
    return { taskCount, doneCount, pct, totalPoints, donePoints }
  }, [selectedSprint, sprintScopedTasks])

  // Average velocity from past sprints (for capacity bar)
  const averageVelocity = useMemo(() => {
    const velocityData: { sprintName: string; velocity: number }[] = [] // TODO: use sprintsApi.getVelocity() when available
    if (velocityData.length === 0) return undefined
    const sum = velocityData.reduce((acc, v) => acc + v.velocity, 0)
    return Math.round(sum / velocityData.length)
  }, [])

  // Team size for selected sprint (unique assignees)
  const sprintTeamSize = useMemo(() => {
    if (!selectedSprint) return undefined
    const ids = new Set<string>()
    for (const task of sprintScopedTasks) {
      if (task.assignees) {
        for (const a of task.assignees) ids.add(a.user?.id ?? a.userId)
      } else if (task.assignedToId) {
        ids.add(task.assignedToId)
      }
    }
    return ids.size || undefined
  }, [selectedSprint, sprintScopedTasks])

  return (
    <div className="min-h-full bg-background">
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                {t("tasks.page.heading")} {!isLoading && total > 0 && <span className="text-muted-foreground font-normal text-lg">({total})</span>}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("tasks.page.subtitle")}
              </p>
            </div>

            <div className="flex items-center gap-3">

          {/* Sprint and Epic filters removed — use "Group by: Sprint/Epic" instead */}


          {/* Search */}
          <div className="relative" data-tour="tasks-search">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder={t("tasks.page.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "pl-9 w-44 h-8 bg-muted/50 border-0 rounded-lg text-sm",
                "focus:w-56 focus:bg-card focus:border-border focus:ring-1 focus:ring-ring",
                "transition-all duration-200"
              )}
            />
          </div>

          {/* View mode toggle buttons */}
          <div className="flex items-center rounded-lg border border-border/60 overflow-hidden" data-tour="tasks-views">
            {VIEW_OPTIONS.map(({ mode, icon: Icon }) => (
              <button
                key={mode}
                onClick={() => handleViewModeChange(mode)}
                data-tour={`tasks-view-${mode}`}
                title={t(`tasks.view.${mode}`)}
                className={cn(
                  "h-8 w-8 flex items-center justify-center transition-colors duration-150",
                  viewMode === mode
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>

          {/* Recurring view toggle (admins, Professional+) */}
          {user?.role === "ADMIN" && hasPlanFeature("recurring") && (
            <Button
              size="sm"
              variant={recurringView ? "default" : "outline"}
              onClick={() => setRecurringView((v) => !v)}
              className={cn(
                "h-8 px-3.5 rounded-lg font-medium text-sm",
                recurringView && "bg-blue-600 text-white hover:bg-blue-700",
              )}
            >
              <Repeat className="size-4 mr-1.5" />
              {t("tasks.page.recurring")}
            </Button>
          )}

          {/* Create Task */}
          {canCreateTasks && (
            <Button
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              data-tour="tasks-create"
              className="h-8 px-3.5 rounded-lg font-medium text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors duration-150"
            >
              <Plus className="size-4 mr-1.5" />
              {t("tasks.page.newTask")}
            </Button>
          )}
            </div>
          </div>
        </div>

        {/* ── Space tabs ─────────────────────────────────────── */}
        {spaces.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => handleSpaceChange(null)}
                className={cn(
                  "relative px-3 py-2 text-sm whitespace-nowrap transition-colors duration-150",
                  !selectedSpaceId
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground font-medium"
                )}
              >
                {t("common.all")}
                {!selectedSpaceId && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-foreground" />
                )}
              </button>
              {spaces.map((space: any) => {
                const isActive = selectedSpaceId === space.id
                const count = spaceTaskCounts.get(space.id) || 0
                return (
                  <button
                    key={space.id}
                    onClick={() => handleSpaceChange(space.id)}
                    className={cn(
                      "relative px-3 py-2 text-sm whitespace-nowrap transition-colors duration-150",
                      isActive
                        ? "text-foreground font-semibold"
                        : "text-muted-foreground hover:text-foreground font-medium"
                    )}
                  >
                    {space.name}
                    {count > 0 && (
                      <span
                        className={cn(
                          "ml-1 text-[11px] tabular-nums",
                          isActive ? "text-foreground/60" : "text-muted-foreground/60"
                        )}
                      >
                        {count}
                      </span>
                    )}
                    {isActive && (
                      <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-foreground" />
                    )}
                  </button>
                )
              })}
            </div>
            <div className="h-px bg-border/50" />
          </div>
        )}

        {recurringView ? (
          <RecurringPanel embedded spaceId={selectedSpaceId} />
        ) : (
          <>


        {/* Group-by tabs (only on list view) */}
        {viewMode === "table" && availableGroupByOptions.length > 1 && (
          <div className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mr-1">{t("tasks.page.group")}</span>
            {availableGroupByOptions.map(({ value }) => (
              <button
                key={value}
                onClick={() => handleGroupByChange(value)}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-colors duration-150 whitespace-nowrap",
                  groupBy === value
                    ? "bg-foreground/10 text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50 font-medium"
                )}
              >
                {t(`tasks.groupBy.${value}`)}
              </button>
            ))}
          </div>
        )}

        {/* Sprint capacity bar — shown when viewing a specific sprint */}
        {selectedSprint && sprintScopedTasks.length > 0 && (
          <div className="mb-4">
            <SprintCapacityBar
              sprint={selectedSprint}
              tasks={sprintScopedTasks}
              teamSize={sprintTeamSize}
              averageVelocity={averageVelocity}
            />
          </div>
        )}

        {/* Backlog refinement toolbar */}
        {scope === "backlog" && effectiveHasModule('sprints') && !isLoading && filteredTasks.length > 0 && (
          <BacklogToolbar
            tasks={filteredTasks}
            selectedIds={selectedTaskIds}
            onBulkEstimate={handleBulkEstimate}
            onBulkPriority={handleBulkPriorityChange}
            onMoveToSprint={handleBulkSprintChange}
            sprints={effectiveSprints}
            sortField={backlogSortField}
            sortDir={backlogSortDir}
            onSortFieldChange={setBacklogSortField}
            onSortDirChange={setBacklogSortDir}
          />
        )}


        {/* ── Content ────────────────────────────────────────── */}

        {/* Error State */}
        {isError && (
          <div className="bg-card rounded-xl border border-border/50 p-16 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="size-14 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                <ClipboardList className="size-7 text-red-500" />
              </div>
              <p className="text-base font-semibold text-foreground">{t("tasks.list.failedToLoad")}</p>
              <p className="text-sm text-muted-foreground">{(error as Error)?.message}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="mt-2 rounded-lg"
              >
                <RefreshCw className="mr-1.5 size-3.5" />
                {t("common.tryAgain")}
              </Button>
            </div>
          </div>
        )}

        {/* Loading State — shimmer skeletons matching each view */}
        {isLoading && <TasksViewSkeleton view={viewMode} />}

        {/* Empty State */}
        {!isLoading && !isError && filteredTasks.length === 0 && (
          <div className="bg-card rounded-xl border border-border/50 p-16 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
                <ClipboardList className="size-7 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-semibold text-foreground">{t("tasks.list.noTasksFound")}</p>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                {activeTab !== "all" || searchQuery || scope !== "all" || selectedSpaceId
                  ? t("tasks.page.adjustFilters")
                  : t("tasks.list.createFirstTask")}
              </p>
              {canCreateTasks && activeTab === "all" && !searchQuery && scope === "all" && !selectedSpaceId && (
                <Button
                  size="sm"
                  onClick={() => setCreateDialogOpen(true)}
                  className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white mt-2"
                >
                  <Plus className="size-4 mr-1.5" />
                  {t("tasks.menu.newTask")}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* List View — flat table */}
        {!isLoading && !isError && filteredTasks.length > 0 && viewMode === "table" && groupBy === "none" && (
          <div data-tour="tasks-list" className="bg-card rounded-xl border border-border/50 overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[24px_1fr_100px_160px_110px_110px_40px] items-center px-3 py-2 border-b border-border/40">
              <div />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t("tasks.columns.title")}</span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t("tasks.columns.priority")}</span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t("tasks.columns.assignee")}</span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t("tasks.columns.dueDate")}</span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t("common.status")}</span>
              <div />
            </div>

            {filteredTasks.map((task: Task, index: number) => (
              <TaskTableRow
                key={task.id}
                task={task}
                index={index}
                canAssign={canAssignTasks}
                onAssign={handleAssignClick}
                sprints={sprints || []}
                phases={effectivePhases}
                epics={effectiveEpics}
                spaces={spaces}
                contextActions={contextActions}
                recentAssignees={recentAssignees}
              />
            ))}
          </div>
        )}

        {/* List View — grouped (replaces table when group is active) */}
        {!isLoading && !isError && filteredTasks.length > 0 && viewMode === "table" && groupBy !== "none" && (
          <GroupedList
            tasks={filteredTasks}
            groupBy={groupBy}
            sprints={sprints || []}
            epics={effectiveEpics}
            spaces={spaces}
            canAssign={canAssignTasks}
            onAssign={handleAssignClick}
            onGroupChange={handleGroupChange}
            onReorder={handleReorder}
            onCreateSprint={() => { setEditingSprint(null); setSprintFormOpen(true) }}
            onCreateEpic={() => { setEditingEpic(null); setEpicFormOpen(true) }}
            contextActions={contextActions}
            phases={effectivePhases}
            recentAssignees={recentAssignees}
          />
        )}

        {/* Board View — always flat kanban */}
        {!isLoading && !isError && filteredTasks.length > 0 && viewMode === "board" && (
          <div data-tour="tasks-board">
          {/* Task Type tabs — a board shows one workflow at a time (columns differ
              per type). Shown only when the SPACE's tasks span more than one type;
              each tab is a type that actually has tasks here (not every org workflow). */}
          {boardWorkflows.length > 1 && (
            <div className="mb-4 flex items-center gap-1.5 flex-wrap">
              {boardWorkflows.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setSelectedWorkflowId(w.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    boardWorkflowId === w.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {w.name}
                  <span className={cn(
                    "text-xs tabular-nums rounded px-1.5 py-0.5",
                    boardWorkflowId === w.id ? "bg-primary-foreground/20" : "bg-foreground/10",
                  )}>
                    {boardWorkflowCounts.get(w.id) ?? 0}
                  </span>
                </button>
              ))}
            </div>
          )}
          <KanbanBoard
            tasks={boardTasks}
            columns={boardKanbanColumns}
            onStatusChange={handleKanbanDrop}
            onReorder={handleReorder}
            onAssignClick={handleAssignClick}
            contextActions={contextActions}
            sprints={sprints || []}
            phases={effectivePhases}
            epics={effectiveEpics}
            spaces={spaces}
            recentAssignees={recentAssignees}
          />
          </div>
        )}


        {/* Schedule View — Roadmap + Timeline + Calendar */}
        {!isLoading && !isError && filteredTasks.length > 0 && viewMode === "schedule" && (
          <div data-tour="tasks-schedule" className="space-y-6">
            {/* Roadmap section — only when space has epics module */}
            {effectiveHasModule('epics') && (() => {
              // Use unfiltered tasks so roadmap stays visible when epic filter is active
              const epicIdsInView = new Set(tasks.map((t: Task) => t.epicId).filter(Boolean))
              const visibleEpics = effectiveEpics.filter(e => epicIdsInView.has(e.id))
              if (visibleEpics.length === 0) return null
              return (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("tasks.schedule.roadmap")}</span>
                    <div className="flex-1 h-px bg-border/50" />
                  </div>
                  <EpicRoadmap
                    epics={visibleEpics}
                    tasks={tasks}
                    activeEpicId={epicFilter !== "all" && epicFilter !== "none" ? epicFilter : null}
                    onEpicClick={(epicId) => {
                      setEpicFilter(epicId ?? "all")
                    }}
                  />
                </div>
              )
            })()}

            {/* Timeline section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("tasks.schedule.timeline")}</span>
                <div className="flex-1 h-px bg-border/50" />
              </div>
              <TimelineView tasks={filteredTasks} phases={effectivePhases} />
            </div>

            {/* Calendar section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("tasks.schedule.calendar")}</span>
                <div className="flex-1 h-px bg-border/50" />
              </div>
              <CalendarView tasks={filteredTasks} />
            </div>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && !isError && total > 0 && (
          <div className="flex items-center justify-between mt-5">
            <p className="text-xs text-muted-foreground">
              {t("tasks.page.showingCount", { count: filteredTasks.length, total })}
            </p>

            {paginated && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-lg"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>

                {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                  let pageNum: number
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (page <= 3) {
                    pageNum = i + 1
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = page - 2 + i
                  }

                  return (
                    <Button
                      key={pageNum}
                      variant={page === pageNum ? "default" : "ghost"}
                      size="icon"
                      className={cn(
                        "size-8 rounded-lg text-xs font-medium",
                        page === pageNum && "bg-foreground text-background hover:bg-foreground/90"
                      )}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  )
                })}

                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-lg"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
          </>
        )}
      </div>

      {/* ── Dialogs ──────────────────────────────────────────── */}

      {canCreateTasks && (
        <CreateTaskDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          defaultSprintId={scope !== "all" && scope !== "backlog" ? scope : null}
          defaultSpaceId={selectedSpaceId}
        />
      )}

      <SprintFormDialog
        open={sprintFormOpen}
        onOpenChange={handleSprintFormClose}
        sprint={editingSprint}
        nextSprintNumber={nextSprintNumber}
        lastSprintEndDate={lastSprintEndDate}
      />

      <CompleteSprintDialog
        open={!!completingSprint}
        onOpenChange={(v) => !v && setCompletingSprint(null)}
        sprint={completingSprint}
        nextSprint={nextPlanningSprint}
        incompleteTasks={incompleteSprintTasks}
        onConfirm={handleCompleteSprintConfirm}
        isPending={completeSprintMutation.isPending}
      />

      <DeleteSprintDialog
        open={!!deletingSprintId}
        onOpenChange={(v) => !v && setDeletingSprintId(null)}
        onConfirm={() => deletingSprintId && deleteSprintMutation.mutate(deletingSprintId)}
        isPending={deleteSprintMutation.isPending}
      />

      <EpicFormDialog
        open={epicFormOpen}
        onOpenChange={(v) => { setEpicFormOpen(v); if (!v) setEditingEpic(null) }}
        epic={editingEpic}
      />

      <BulkActionBar
        selectedIds={selectedTaskIds}
        sprints={sprints || []}
        spaces={spaces}
        onClear={handleClearSelection}
        onBulkStatusChange={handleBulkStatusChange}
        onBulkPriorityChange={handleBulkPriorityChange}
        onBulkSprintChange={handleBulkSprintChange}
        onBulkSpaceChange={handleBulkSpaceChange}
        onBulkDelete={handleBulkDelete}
      />

      <AssignMemberDialog
        open={assignDialogOpen}
        onOpenChange={(open) => {
          setAssignDialogOpen(open)
          if (!open) setSelectedTaskId(null)
        }}
        taskId={selectedTaskId}
        spaceId={selectedTaskId ? (tasks.find((t: Task) => t.id === selectedTaskId)?.spaceId ?? selectedSpaceId) : selectedSpaceId}
        currentAssigneeId={selectedTaskId ? (tasks.find((t: Task) => t.id === selectedTaskId)?.assignedToId ?? null) : null}
        currentAssigneeIds={selectedTaskId ? (tasks.find((t: Task) => t.id === selectedTaskId)?.assignees?.map((a: any) => a.userId) ?? []) : []}
        isAssigning={assignMutation.isPending}
        onAssign={(memberId) => assignMutation.mutate(memberId)}
        onSave={async (added, removed) => {
          if (!selectedTaskId) return
          // Optimistic update, then batch: remove first, then add
          await queryClient.cancelQueries({ queryKey: ["tasks"] })
          const snapshot = snapshotTasksCache(queryClient)
          optimisticUpdateTask(queryClient, selectedTaskId, (t) => {
            let assignees = [...(t.assignees || [])]
            assignees = assignees.filter((a: any) => !removed.includes(a.userId))
            for (const memberId of added) {
              if (!assignees.find((a: any) => a.userId === memberId)) {
                assignees.push({ id: `temp-${memberId}`, userId: memberId, role: assignees.length === 0 ? "LEAD" as const : "MEMBER" as const, user: { id: memberId, firstName: "", lastName: "" }, createdAt: new Date().toISOString() } as any)
              }
            }
            return { ...t, assignees }
          })
          const ops: Promise<any>[] = [
            ...removed.map(id => tasksApi.removeAssignee(selectedTaskId, id)),
            ...added.map(id => tasksApi.addAssignee(selectedTaskId, id)),
          ]
          const results = await Promise.allSettled(ops)
          const failed = results.filter(r => r.status === "rejected").length
          if (failed > 0) {
            restoreTasksCache(queryClient, snapshot)
            notify.error(t("tasks.notify.assigneeUpdatesFailed", { failed }))
          } else {
            notify.success(t("tasks.detail.assigneesUpdated"))
          }
          queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" })
        }}
      />
    </div>
  )
}

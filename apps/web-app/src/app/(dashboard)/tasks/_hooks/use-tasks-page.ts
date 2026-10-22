"use client";

import { useState, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { keys } from "@/lib/query-keys";
import { useAuth } from "@/contexts/auth-context";
import { useBillingLock } from "@/hooks/use-billing-lock";
import type { Task } from "@/lib/api";
import { useSpaceModules } from "@/hooks/use-space-modules";
import { sortBacklogTasks } from "../_components/backlog-toolbar";
import { useTaskFilters } from "./use-task-filters";
import { useTaskStatusTabs, useBoardWorkflow } from "./use-task-workflow";
import { useTaskListData } from "./use-task-list-data";
import { useSprintPlanning } from "./use-sprint-planning";
import { useTaskAssign } from "./use-task-assign";
import { useTaskStatusChange } from "./use-task-status-change";
import { useTaskRowActions } from "./use-task-row-actions";
import { useTaskSelection } from "./use-task-selection";
import { useTaskBulkActions } from "./use-task-bulk-actions";
import { useTaskCommands } from "./use-task-commands";
import { useGroupByOptions } from "./use-group-by-options";
import { PRIORITY_ORDER, type TaskViewContext } from "../_lib/task-list";
import { hasAccessModule } from "@hbcfield/shared/client";

/** TasksPage's state and handlers — everything before its markup, moved here unchanged. */
export function useTasksPage() {
  const { user, hasModule, hasPlanFeature, hasPermission } = useAuth()
  const queryClient = useQueryClient()

  // Ref for focusing search input via keyboard shortcut
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Search, tab, view, grouping, page, scope, epic, workspace, task type, mine.
  const {
    searchQuery, setSearchQuery, debouncedSearch,
    activeTab,
    viewMode, handleViewModeChange,
    groupBy, setGroupBy, handleGroupByChange,
    page, setPage, limit,
    scope, setScope,
    epicFilter, setEpicFilter,
    selectedSpaceId, handleSpaceChange,
    backlogSortField, setBacklogSortField,
    backlogSortDir, setBacklogSortDir,
    selectedWorkflowId, setSelectedWorkflowId,
    mineOnly, setMineOnly,
  } = useTaskFilters()

  // Create task dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [recurringView, setRecurringView] = useState(false)

  // Dynamic workflow status tabs — space- AND task-type-aware.
  const { orgWorkflows, contextDefaultWorkflowId, activeWorkflowId, activeStatuses } = useTaskStatusTabs({
    selectedSpaceId,
    selectedWorkflowId,
    activeTab,
  })

  // Every filter is applied by the SERVER — see useTaskListData.
  const {
    canSeeOthers, paginated,
    tasks, meta, isLoading, isError, error, refetch,
    myCounts, spaceTaskCounts,
    phases, sprints, epics, spaces,
  } = useTaskListData({
    activeStatuses,
    debouncedSearch,
    selectedSpaceId,
    scope,
    epicFilter,
    page,
    limit,
    viewMode,
    mineOnly,
  })

  // Space-aware modules
  const { hasModule: spaceHasModule } = useSpaceModules(selectedSpaceId)
  // Use space-level hasModule when a space is selected, otherwise org-level
  const effectiveHasModule = selectedSpaceId ? spaceHasModule : hasModule

  const planning = useSprintPlanning({ sprints, tasks, scope, setScope })
  const { effectiveSprints, selectedSprint, sprintScopedTasks, sprintTeamSize, averageVelocity } = planning

  const assign = useTaskAssign()
  const { handleAssignClick } = assign

  const handleRefresh = () => {
    refetch()
    queryClient.invalidateQueries({ queryKey: keys.tasks.counts() })
  }

  const effectivePhases = phases || []
  const effectiveEpics = epics || []

  const { stepMove, workflowForTask, clockGate, officeStart, requestStatusChange, handleKanbanDrop } =
    useTaskStatusChange({ tasks, orgWorkflows, contextDefaultWorkflowId })

  const { handleReorder, handleGroupChange, contextActions, recentAssignees } =
    useTaskRowActions({ tasks, requestStatusChange })

  // Bulk selection
  const { selectedTaskIds, filteredTasksRef, handleClearSelection } = useTaskSelection()
  const {
    handleBulkStatusChange,
    handleBulkPriorityChange,
    handleBulkSprintChange,
    handleBulkDelete,
    handleBulkEstimate,
    handleBulkSpaceChange,
  } = useTaskBulkActions({ tasks, workflowForTask, handleClearSelection })

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

  // ── Smart board task-type picker ──────────────────────────────────────────
  const { boardWorkflowCounts, boardWorkflows, boardWorkflowId, boardKanbanColumns, boardTasks } = useBoardWorkflow({
    tasks,
    filteredTasks,
    selectedSpaceId,
    selectedWorkflowId,
    contextDefaultWorkflowId,
    activeWorkflowId,
    orgWorkflows,
  })

  // Sync ref for shift-click range selection
  filteredTasksRef.current = filteredTasks

  // Pagination
  const totalPages = meta?.totalPages || 1
  const total = meta?.total || 0

  // Create requires BOTH the permission and the create_task access module.
  /*
    Asked through hasPermission, not the flat column.

    `user.canCreateTasks` is the ORG-wide resolution, so somebody whose grant
    comes from a SPACE role held it false and the button never appeared — while
    `POST /tasks` is already `@RequirePermissionInSpace('canCreateTasks')` and
    would have accepted the request. The API allowed what the UI refused to
    offer.

    The Access Profile check stays: it is a different question — whether the
    create screen is part of this member's app at all.
  */
  const canCreateTasks = hasPermission("canCreateTasks") && hasAccessModule(user ?? {}, "create_task")
  const { locked: billingLocked, reason: billingLockReason } = useBillingLock()
  const canAssignTasks = hasPermission('canAssignTasks')

  // ── Keyboard shortcuts + command palette ──────────────────────────────────
  useTaskCommands({
    canCreateTasks,
    spaces,
    searchInputRef,
    openCreateDialog: () => setCreateDialogOpen(true),
    openNewSprint: planning.openNewSprint,
    showBacklog: () => { setScope("backlog"); setPage(1) },
    handleViewModeChange,
    handleClearSelection,
    handleSpaceChange,
  })

  // Available group-by options based on modules (and the fallback to "none")
  const { availableGroupByOptions } = useGroupByOptions({
    groupBy,
    setGroupBy,
    effectiveHasModule,
    epicCount: effectiveEpics.length,
    selectedSpaceId,
    spaceCount: spaces.length,
  })

  // What every view hands its rows and cards.
  const viewContext: TaskViewContext = {
    sprints: sprints || [],
    phases: effectivePhases,
    epics: effectiveEpics,
    spaces,
    contextActions,
    recentAssignees,
  }
  const showContent = !isLoading && !isError && filteredTasks.length > 0

  return {
    user,
    hasPlanFeature,
    searchInputRef,
    searchQuery,
    setSearchQuery,
    activeTab,
    viewMode,
    handleViewModeChange,
    groupBy,
    handleGroupByChange,
    page,
    setPage,
    scope,
    epicFilter,
    setEpicFilter,
    selectedSpaceId,
    handleSpaceChange,
    backlogSortField,
    setBacklogSortField,
    backlogSortDir,
    setBacklogSortDir,
    setSelectedWorkflowId,
    mineOnly,
    setMineOnly,
    createDialogOpen,
    setCreateDialogOpen,
    recurringView,
    setRecurringView,
    canSeeOthers,
    paginated,
    tasks,
    isLoading,
    isError,
    error,
    myCounts,
    spaceTaskCounts,
    phases,
    sprints,
    epics,
    spaces,
    effectiveHasModule,
    planning,
    effectiveSprints,
    selectedSprint,
    sprintScopedTasks,
    sprintTeamSize,
    averageVelocity,
    assign,
    handleAssignClick,
    handleRefresh,
    effectivePhases,
    effectiveEpics,
    stepMove,
    clockGate,
    officeStart,
    handleKanbanDrop,
    handleReorder,
    handleGroupChange,
    selectedTaskIds,
    handleClearSelection,
    handleBulkStatusChange,
    handleBulkPriorityChange,
    handleBulkSprintChange,
    handleBulkDelete,
    handleBulkEstimate,
    handleBulkSpaceChange,
    filteredTasks,
    boardWorkflowCounts,
    boardWorkflows,
    boardWorkflowId,
    boardKanbanColumns,
    boardTasks,
    totalPages,
    total,
    canCreateTasks,
    billingLocked,
    billingLockReason,
    canAssignTasks,
    availableGroupByOptions,
    viewContext,
    showContent,
  };
}

/** What TasksPage and its sections read. */
export type TasksPageState = ReturnType<typeof useTasksPage>;

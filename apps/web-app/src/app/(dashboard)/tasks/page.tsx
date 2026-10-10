"use client"

import { OfficeStartDialog } from "@/components/office-start-dialog"
import { ClockGateDialog } from "@/components/clock-gate-dialog"

import { useState, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import { useQueryClient } from "@tanstack/react-query"

import { keys } from "@/lib/query-keys"

import { useAuth } from "@/contexts/auth-context"
import { useBillingLock } from "@/hooks/use-billing-lock"
import type { Task } from "@/lib/api"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { TasksViewSkeleton } from "./_components/tasks-skeleton"
import { SpaceTabs } from "@/components/space-tabs"

import { RoleJobsSummary } from "./_components/role-jobs-summary"
import { BulkActionBar } from "./_components/bulk-action-bar"
import { BacklogToolbar, sortBacklogTasks } from "./_components/backlog-toolbar"
import { SprintCapacityBar } from "./_components/sprint-capacity"
import { TasksPageHeader } from "./_components/tasks-page-header"
import { MineScopeToggle } from "./_components/mine-scope-toggle"
import { GroupByTabs } from "./_components/group-by-tabs"
import { TasksErrorState, TasksEmptyState } from "./_components/tasks-states"
import { TaskListView } from "./_components/task-list-view"
import { TaskBoardView } from "./_components/task-board-view"
import { TaskScheduleView } from "./_components/task-schedule-view"
import { TasksPagination } from "./_components/tasks-pagination"
import { TaskPlanningDialogs } from "./_components/task-planning-dialogs"
import { TaskAssignDialog } from "./_components/task-assign-dialog"
import { useTaskFilters } from "./_hooks/use-task-filters"
import { useTaskStatusTabs, useBoardWorkflow } from "./_hooks/use-task-workflow"
import { useTaskListData } from "./_hooks/use-task-list-data"
import { useSprintPlanning } from "./_hooks/use-sprint-planning"
import { useTaskAssign } from "./_hooks/use-task-assign"
import { useTaskStatusChange } from "./_hooks/use-task-status-change"
import { useTaskRowActions } from "./_hooks/use-task-row-actions"
import { useTaskSelection } from "./_hooks/use-task-selection"
import { useTaskBulkActions } from "./_hooks/use-task-bulk-actions"
import { useTaskCommands } from "./_hooks/use-task-commands"
import { useGroupByOptions } from "./_hooks/use-group-by-options"
import { PRIORITY_ORDER, type TaskViewContext } from "./_lib/task-list"

// Lazy (audit T-C1). Only ONE view renders at a time and the dialogs render on a
// click, but all of them were in the first paint of the heaviest page in the
// product — the create dialog alone is 1,402 lines, the timeline 702. The default
// board (KanbanBoard / TaskTableRow) stays static so the primary path has no
// loading flash. ssr:false: none of these renders on the server. The schedule's
// views, the grouped list and the sprint dialogs are lazy in their own files.
// Shown only on the Recurring tab — loaded when opened, like the other alternate views.
const RecurringPanel = dynamic(() => import("./recurring/recurring-view").then((m) => m.RecurringPanel), { ssr: false })
const CreateTaskDialog = dynamic(() => import("./_components/create-task-dialog").then((m) => m.CreateTaskDialog), { ssr: false })
import { hasAccessModule } from "@hbcfield/shared/client"
import { PAGE_SHELL } from "@/components/ui/page-width";

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TasksPage() {
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

  return (
    <div className="min-h-full bg-background">
      <ClockGateDialog {...clockGate.dialogProps} />
      <OfficeStartDialog {...officeStart.dialogProps} />
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className={PAGE_SHELL}>
        {/* ── Header ─────────────────────────────────────────── */}
        <TasksPageHeader
          isLoading={isLoading}
          total={total}
          searchInputRef={searchInputRef}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          showRecurringToggle={user?.role === "ADMIN" && hasPlanFeature("recurring")}
          recurringView={recurringView}
          onToggleRecurring={() => setRecurringView((v) => !v)}
          canCreateTasks={canCreateTasks}
          billingLocked={billingLocked}
          billingLockReason={billingLockReason}
          onCreateTask={() => setCreateDialogOpen(true)}
        />

        {/* Tasks open to a work role: open now, overdue, minutes to take (renders nothing until used). */}
        {canSeeOthers && <RoleJobsSummary spaceId={selectedSpaceId} />}

        {/* ── Space tabs ─────────────────────────────────────── */}
        {/*
          The row this pattern was invented in, now rendered by the shared
          component — Clients, Assets and Portals ask the same question and must
          not each answer it their own way. Same markup, same counts, moved.
        */}
        <SpaceTabs
          spaces={spaces.map((space) => ({
            id: space.id,
            name: space.name,
            count: spaceTaskCounts.get(space.id) || 0,
          }))}
          value={selectedSpaceId}
          onChange={handleSpaceChange}
        />

        {/* Mine, or everything I oversee. */}
        {canSeeOthers && (
          <MineScopeToggle
            mineOnly={mineOnly}
            counts={myCounts}
            onChange={(isMine) => { setMineOnly(isMine); setPage(1) }}
          />
        )}

        {recurringView ? (
          <RecurringPanel embedded spaceId={selectedSpaceId} />
        ) : (
          <>


        {/* Group-by tabs (only on list view) */}
        {viewMode === "table" && availableGroupByOptions.length > 1 && (
          <GroupByTabs options={availableGroupByOptions} value={groupBy} onChange={handleGroupByChange} />
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
        {isError && <TasksErrorState error={error} onRetry={handleRefresh} />}

        {/* Loading State — shimmer skeletons matching each view */}
        {isLoading && <TasksViewSkeleton view={viewMode} />}

        {/* Empty State */}
        {!isLoading && !isError && filteredTasks.length === 0 && (
          <TasksEmptyState
            filtered={!!(activeTab !== "all" || searchQuery || scope !== "all" || selectedSpaceId)}
            canCreate={canCreateTasks && activeTab === "all" && !searchQuery && scope === "all" && !selectedSpaceId}
            onCreateTask={() => setCreateDialogOpen(true)}
          />
        )}

        {/* List View — flat table, or grouped (replaces table when group is active) */}
        {showContent && viewMode === "table" && (
          <TaskListView
            tasks={filteredTasks}
            groupBy={groupBy}
            canAssign={canAssignTasks}
            onAssign={handleAssignClick}
            onGroupChange={handleGroupChange}
            onReorder={handleReorder}
            onCreateSprint={planning.openNewSprint}
            onCreateEpic={planning.openNewEpic}
            context={viewContext}
          />
        )}

        {/* Board View — always flat kanban */}
        {showContent && viewMode === "board" && (
          <TaskBoardView
            tasks={boardTasks}
            columns={boardKanbanColumns}
            boardWorkflows={boardWorkflows}
            boardWorkflowId={boardWorkflowId}
            boardWorkflowCounts={boardWorkflowCounts}
            onSelectWorkflow={setSelectedWorkflowId}
            onStatusChange={handleKanbanDrop}
            onReorder={handleReorder}
            onAssignClick={handleAssignClick}
            context={viewContext}
          />
        )}


        {/* Schedule View — Roadmap + Timeline + Calendar */}
        {showContent && viewMode === "schedule" && (
          <TaskScheduleView
            tasks={tasks}
            filteredTasks={filteredTasks}
            showRoadmap={effectiveHasModule('epics')}
            epics={effectiveEpics}
            phases={effectivePhases}
            epicFilter={epicFilter}
            onEpicFilterChange={setEpicFilter}
          />
        )}

        {/* Pagination */}
        {!isLoading && !isError && total > 0 && (
          <TasksPagination
            shownCount={filteredTasks.length}
            total={total}
            paginated={paginated}
            page={page}
            totalPages={totalPages}
            setPage={setPage}
          />
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

      <TaskPlanningDialogs planning={planning} />

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

      {stepMove.dialog}
      <TaskAssignDialog assign={assign} tasks={tasks} selectedSpaceId={selectedSpaceId} />
    </div>
  )
}

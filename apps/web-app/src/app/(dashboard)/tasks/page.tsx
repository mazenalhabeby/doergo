"use client"
// size-exempt: the tasks page's one layout — header, tabs, the chosen view, its dialogs — read top to bottom

import dynamic from "next/dynamic"
import { OfficeStartDialog } from "@/components/tasks/office-start-dialog"
import { ClockGateDialog } from "@/components/tasks/clock-gate-dialog"
import { SpaceTabs } from "@/components/spaces/space-tabs"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { BulkActionBar } from "./_components/bulk-action-bar"
import { TaskPlanningDialogs } from "./_components/task-planning-dialogs"
import { TaskAssignDialog } from "./_components/task-assign-dialog"
import { TasksViewSkeleton } from "../../../components/skeletons/tasks-skeleton"
import { RoleJobsSummary } from "./_components/role-jobs-summary"
import { BacklogToolbar } from "./_components/backlog-toolbar"
import { SprintCapacityBar } from "./_components/sprint-capacity"
import { TasksPageHeader } from "./_components/tasks-page-header"
import { MineScopeToggle } from "./_components/mine-scope-toggle"
import { TasksToolbar } from "./_components/tasks-toolbar"
import { GroupByTabs } from "./_components/group-by-tabs"
import { TasksErrorState, TasksEmptyState } from "./_components/tasks-states"
import { TaskListView } from "./_components/task-list-view"
import { TaskBoardView } from "./_components/task-board-view"
import { TaskScheduleView } from "./_components/task-schedule-view"
import { TasksPagination } from "./_components/tasks-pagination"
import { useTasksPage } from "./_hooks/use-tasks-page"

// Lazy (audit T-C1). Only ONE view renders at a time and the dialogs render on a
// click, but all of them were in the first paint of the heaviest page in the
// product — the create dialog alone is 1,402 lines, the timeline 702. The default
// board (KanbanBoard / TaskTableRow) stays static so the primary path has no
// loading flash. ssr:false: none of these renders on the server. The schedule's
// views, the grouped list and the sprint dialogs are lazy in their own files.
// Shown only on the Recurring tab — loaded when opened, like the other alternate views.
const RecurringPanel = dynamic(
  () => import("../../../components/tasks/recurring/recurring-view").then((m) => m.RecurringPanel),
  {
    ssr: false,
  },
)

const CreateTaskDialog = dynamic(
  () => import("../../../components/tasks/create-task-dialog").then((m) => m.CreateTaskDialog),
  {
    ssr: false,
  },
)

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TasksPage() {
  const {
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
    sprints,
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
  } = useTasksPage()

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

        {/* Mine, or everything I oversee — then search and the view switch. */}
        <TasksToolbar
          searchInputRef={searchInputRef}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        >
          {canSeeOthers && (
            <MineScopeToggle
              mineOnly={mineOnly}
              counts={myCounts}
              onChange={(isMine) => {
                setMineOnly(isMine)
                setPage(1)
              }}
            />
          )}
        </TasksToolbar>

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
            {scope === "backlog" && effectiveHasModule("sprints") && !isLoading && filteredTasks.length > 0 && (
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
                showRoadmap={effectiveHasModule("epics")}
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

"use client";

import { TasksViewSkeleton } from "./tasks-skeleton";
import { SpaceTabs } from "@/components/spaces/space-tabs";
import { RoleJobsSummary } from "./role-jobs-summary";
import { BacklogToolbar } from "./backlog-toolbar";
import { SprintCapacityBar } from "./sprint-capacity";
import { TasksPageHeader } from "./tasks-page-header";
import { MineScopeToggle } from "./mine-scope-toggle";
import { GroupByTabs } from "./group-by-tabs";
import { TasksErrorState, TasksEmptyState } from "./tasks-states";
import { TaskListView } from "./task-list-view";
import { TaskBoardView } from "./task-board-view";
import { TaskScheduleView } from "./task-schedule-view";
import { TasksPagination } from "./tasks-pagination";
import { PAGE_SHELL } from "@/components/ui/page-width";
import { RecurringPanel } from "./tasks-page-helpers";
import type { TasksPageState } from "../_hooks/use-tasks-page";

/** Part of TasksPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function TasksPagePart({ vm }: { vm: TasksPageState }) {
  const {
    isLoading,
    total,
    searchInputRef,
    searchQuery,
    setSearchQuery,
    viewMode,
    handleViewModeChange,
    user,
    hasPlanFeature,
    recurringView,
    setRecurringView,
    canCreateTasks,
    billingLocked,
    billingLockReason,
    setCreateDialogOpen,
    canSeeOthers,
    selectedSpaceId,
    spaces,
    spaceTaskCounts,
    handleSpaceChange,
    mineOnly,
    myCounts,
    setMineOnly,
    setPage,
    availableGroupByOptions,
    groupBy,
    handleGroupByChange,
    selectedSprint,
    sprintScopedTasks,
    sprintTeamSize,
    averageVelocity,
    scope,
    effectiveHasModule,
    filteredTasks,
    selectedTaskIds,
    handleBulkEstimate,
    handleBulkPriorityChange,
    handleBulkSprintChange,
    effectiveSprints,
    backlogSortField,
    backlogSortDir,
    setBacklogSortField,
    setBacklogSortDir,
    isError,
    error,
    handleRefresh,
    activeTab,
    showContent,
    canAssignTasks,
    handleAssignClick,
    handleGroupChange,
    handleReorder,
    planning,
    viewContext,
    boardTasks,
    boardKanbanColumns,
    boardWorkflows,
    boardWorkflowId,
    boardWorkflowCounts,
    setSelectedWorkflowId,
    handleKanbanDrop,
    tasks,
    effectiveEpics,
    effectivePhases,
    epicFilter,
    setEpicFilter,
    paginated,
    page,
    totalPages,
  } = vm;
  return (
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
  );
}

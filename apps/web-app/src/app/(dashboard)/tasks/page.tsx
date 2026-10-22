"use client"

import { OfficeStartDialog } from "@/components/tasks/office-start-dialog"
import { ClockGateDialog } from "@/components/tasks/clock-gate-dialog"




import { BulkActionBar } from "./_components/bulk-action-bar"
import { TaskPlanningDialogs } from "./_components/task-planning-dialogs"
import { TaskAssignDialog } from "./_components/task-assign-dialog"
import { useTasksPage } from "./_hooks/use-tasks-page";
import { CreateTaskDialog } from "./_components/tasks-page-helpers";
import { TasksPagePart } from "./_components/tasks-page-part";

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TasksPage() {
  const vm = useTasksPage();
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
  } = vm;

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

      <TasksPagePart vm={vm} />

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

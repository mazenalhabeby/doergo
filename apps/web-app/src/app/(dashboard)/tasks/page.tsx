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
import { hasAccessModule } from "@hbcfield/shared/client"
import { PAGE_SHELL } from "@/components/ui/page-width";
import { useTasksPage } from "./use-tasks-page";
import { RecurringPanel, CreateTaskDialog } from "./tasks-page-helpers";
import { TasksPagePart } from "./tasks-page-part";

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

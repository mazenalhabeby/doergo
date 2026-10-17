"use client"

import { flowIdOf } from "@/hooks/use-step-config"
import React from "react"
import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { useWorkflow } from "@/hooks/use-org-workflow"
import { isFinishedStatus, STATUS_TRANSITIONS } from "@hbcfield/shared/client"
import { getStatusConfig, TASK_STATUSES } from "@/lib/constants"
import type { Task, Sprint, Phase, Epic } from "@/lib/api"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface TaskContextMenuActions {
  onStatusChange?: (taskId: string, status: string) => void
  onPriorityChange?: (taskId: string, priority: string) => void
  onAssigneeChange?: (taskId: string, assigneeId: string | null) => void
  onSprintChange?: (taskId: string, sprintId: string | null) => void
  onPhaseChange?: (taskId: string, phaseId: string | null) => void
  onEpicChange?: (taskId: string, epicId: string | null) => void
  onStoryPointsChange?: (taskId: string, points: number | null) => void
  onSpaceChange?: (taskId: string, spaceId: string | null) => void
  onDelete?: (taskId: string) => void
}

export interface TaskContextMenuProps {
  task: Task
  children: React.ReactNode
  sprints?: Sprint[]
  phases?: Phase[]
  epics?: Epic[]
  spaces?: { id: string; name: string }[]
  actions: TaskContextMenuActions
  /** Unique assignees from recent tasks for quick assign */
  recentAssignees?: { id: string; firstName: string; lastName: string }[]
}

/** TaskContextMenuInner's state and handlers — everything before its markup, moved here unchanged. */
export function useTaskContextMenuInner({
  task,
  children,
  sprints = [],
  phases = [],
  epics = [],
  spaces = [],
  actions,
  recentAssignees = [],
}: Pick<TaskContextMenuProps, 'task' | 'children' | 'sprints' | 'phases' | 'epics' | 'spaces' | 'actions' | 'recentAssignees'>) {
  const { t } = useTranslation()
  const { user, hasPermission } = useAuth()

  /*
    The statuses THIS task can be in — its own type's, not a fixed list. Same
    derivation as the table row; both feed the shared rule so what is offered
    matches what the service accepts.
  */
  const { statuses: flowStatuses, hasWorkflow: taskHasWorkflow } = useWorkflow(flowIdOf(task))
  const usesFlow = taskHasWorkflow && flowStatuses.length > 0
  const statusOptions = usesFlow
    ? flowStatuses.map((st) => ({ key: st.key, label: st.name, hex: st.color }))
    : TASK_STATUSES.filter((st) => st !== "DRAFT").map((st) => {
        const cfg = getStatusConfig(st)
        return { key: st, label: cfg.label, hex: cfg.hex }
      })
  const currentFlowStatus = usesFlow ? flowStatuses.find((st) => st.key === task.status) : undefined
  const currentIsFinished = usesFlow
    ? !!currentFlowStatus?.isFinal || !!currentFlowStatus?.isCanceled
    : isFinishedStatus(task.status)
  const allowedTargets: string[] = usesFlow
    ? (currentFlowStatus?.transitions ?? [])
    : ((STATUS_TRANSITIONS[task.status as keyof typeof STATUS_TRANSITIONS] ?? []) as string[])
  const isManager = user?.role === "ADMIN" || hasPermission('canViewAllTasks')
  const router = useRouter()
/*
    Modules are the SPACE's, and a board can show tasks from several spaces at
    once — so the row asks about its OWN task's space rather than the
    organization's set. Cached per space by the hook, so a board of fifty rows
    from three spaces makes three lookups, not fifty.
  */
  const { hasModule: orgHasModule } = useAuth()
  const { hasModule: spaceHasModule } = useSpaceModules(task.spaceId ?? null)
  const hasModule = task.spaceId ? spaceHasModule : orgHasModule

  return {
    t,
    flowStatuses,
    statusOptions,
    currentIsFinished,
    allowedTargets,
    isManager,
    router,
    hasModule,
  }
}

/** What TaskContextMenuInner and its sections read. */
export type TaskContextMenuInnerState = ReturnType<typeof useTaskContextMenuInner>

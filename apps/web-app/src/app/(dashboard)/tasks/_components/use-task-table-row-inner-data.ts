"use client"

import { flowIdOf, stepConfig, useStepLabel } from "@/hooks/use-step-config"
import React from "react"
import {
  isTaskOverdue,
  isFinishedStatus,
  hasAnyTransition,
  STATUS_TRANSITIONS,
} from "@hbcfield/shared/client"
import { useWorkflow } from "@/hooks/use-org-workflow"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/contexts/auth-context"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { getStatusConfig, getPriorityConfig, TASK_STATUSES } from "@/lib/constants"
import type { Task, Sprint, Phase, Epic } from "@/lib/api"
import { type TaskContextMenuActions } from "./task-context-menu"
import { dateLocale } from "@/lib/format-date"

export interface TaskTableRowProps {
  task: Task
  index: number
  canAssign: boolean
  onAssign: (taskId: string) => void
  isSelected?: boolean
  onToggleSelect?: (taskId: string, shiftKey: boolean) => void
  hasAnySelected?: boolean
  sprints?: Sprint[]
  phases?: Phase[]
  epics?: Epic[]
  spaces?: { id: string; name: string }[]
  contextActions?: TaskContextMenuActions
  recentAssignees?: { id: string; firstName: string; lastName: string }[]
  // Drag props
  draggable?: boolean
  onDragStart?: (e: React.DragEvent, taskId: string) => void
  isDragging?: boolean
}

/** useTaskTableRowInner's state and handlers — everything before its markup, moved here unchanged. */
export function useTaskTableRowInnerData({
  task,
  index,
  canAssign,
  onAssign,
  sprints,
  phases,
  epics,
  spaces,
  contextActions,
  recentAssignees,
  draggable = false,
  onDragStart,
  isDragging = false,
}: Pick<Pick<TaskTableRowProps, 'task' | 'index' | 'canAssign' | 'onAssign' | 'sprints' | 'phases' | 'epics' | 'spaces' | 'contextActions' | 'recentAssignees' | 'draggable' | 'onDragStart' | 'isDragging'>,
  | 'task'
  | 'index'
  | 'canAssign'
  | 'onAssign'
  | 'sprints'
  | 'phases'
  | 'epics'
  | 'spaces'
  | 'contextActions'
  | 'recentAssignees'
  | 'draggable'
  | 'onDragStart'
  | 'isDragging'
>) {
  const { t } = useTranslation()
/*
    Modules are the SPACE's, and a board can show tasks from several spaces at
    once — so the row asks about its OWN task's space rather than the
    organization's set. Cached per space by the hook, so a board of fifty rows
    from three spaces makes three lookups, not fifty.
  */
  const { hasModule: orgHasModule, user, hasPermission } = useAuth()
  const { hasModule: spaceHasModule } = useSpaceModules(task.spaceId ?? null)
  const hasModule = task.spaceId ? spaceHasModule : orgHasModule
  const router = useRouter()

  /*
    The statuses THIS task can be in — its own task type's, not a fixed list.

    The dropdown listed the canonical statuses regardless of the task's type, so
    a task on a custom flow was offered columns that do not exist in it. It
    reads the task's workflow now, falling back to the canonical machine only
    when the task has none.
  */
  // The task's own flow, else its workspace's — a task with no type of its own inherits it.
  const { statuses: flowStatuses, hasWorkflow: taskHasWorkflow } = useWorkflow(flowIdOf(task))
  const { translate: stepTranslate, label: stepLabel } = useStepLabel()
  const statusConfig = stepConfig(task.status, flowStatuses, stepTranslate)
  const statusOptions = taskHasWorkflow && flowStatuses.length
    ? flowStatuses.map((st) => ({ key: st.key, label: stepLabel(st), hex: st.color }))
    : TASK_STATUSES.filter((st) => st !== "DRAFT").map((st) => {
        const cfg = getStatusConfig(st)
        return { key: st, label: cfg.label, hex: cfg.hex }
      })

  const currentIsFinished = taskHasWorkflow && flowStatuses.length
    ? (() => {
        const cur = flowStatuses.find((st) => st.key === task.status)
        return !!cur?.isFinal || !!cur?.isCanceled
      })()
    : isFinishedStatus(task.status)

  const allowedTargets: string[] = taskHasWorkflow && flowStatuses.length
    ? (flowStatuses.find((st) => st.key === task.status)?.transitions ?? [])
    : ((STATUS_TRANSITIONS[task.status as keyof typeof STATUS_TRANSITIONS] ?? []) as string[])

  const isManager = user?.role === "ADMIN" || hasPermission('canViewAllTasks')

  // Offered only when there is something to offer: an action to call, and a
  // task the server would actually move.
  const canChangeStatus = !!contextActions?.onStatusChange && hasAnyTransition({
    allowedTargets,
    isManager,
    fromIsFinished: currentIsFinished,
  })
  const priorityConfig = getPriorityConfig(task.priority)
  const PriorityIcon = priorityConfig.icon

  const isOverdue = isTaskOverdue(task)

  const formattedDueDate = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" })
    : null

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on action buttons or drag handle
    const target = e.target as HTMLElement
    if (target.closest("[data-no-navigate]")) return
    router.push(`/tasks/${task.id}`)
  }

  return {
    t,
    user,
    hasModule,
    statusConfig,
    statusOptions,
    currentIsFinished,
    allowedTargets,
    isManager,
    canChangeStatus,
    priorityConfig,
    PriorityIcon,
    isOverdue,
    formattedDueDate,
    handleRowClick,
  }
}

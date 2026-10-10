"use client"

import { useMemo } from "react"

import { useOrgWorkflow, useWorkflow, buildStatusTabs, buildKanbanColumns, type StatusTabGroup } from "@/hooks/use-org-workflow"
import { useSpaceWorkflow } from "@/hooks/use-space-modules"
import { useStepLabel } from "@/hooks/use-step-config"
import type { Task } from "@/lib/api"
import { FALLBACK_STATUS_TABS } from "../_lib/task-list"

/**
 * Dynamic workflow status tabs — space- AND task-type-aware.
 *
 * A space can hold tasks of several types (workflows); the Task Type picker
 * chooses which one the board/tabs reflect, defaulting to the space's (or
 * org's) default. Everything downstream reads `activeWorkflowStatuses`.
 */
export function useTaskStatusTabs({
  selectedSpaceId,
  selectedWorkflowId,
  activeTab,
}: {
  selectedSpaceId: string | null
  selectedWorkflowId: string | null
  activeTab: string
}) {
  const { workflows: orgWorkflows, defaultWorkflow } = useOrgWorkflow()
  const { workflowId: spaceWorkflowId } = useSpaceWorkflow(selectedSpaceId)
  const contextDefaultWorkflowId = (selectedSpaceId ? spaceWorkflowId : null) ?? defaultWorkflow?.id ?? null
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

  return { orgWorkflows, contextDefaultWorkflowId, activeWorkflowId, activeStatuses }
}

/**
 * Smart board task-type picker.
 *
 * Only offer the workflows that the space's tasks ACTUALLY use (a task's type
 * is its own workflowId, else the space default) — not every org workflow. The
 * board renders one type at a time (columns differ per workflow); default to the
 * space's own type when present, else the first type that has tasks here.
 */
export function useBoardWorkflow({
  tasks,
  filteredTasks,
  selectedSpaceId,
  selectedWorkflowId,
  contextDefaultWorkflowId,
  activeWorkflowId,
  orgWorkflows,
}: {
  tasks: Task[]
  filteredTasks: Task[]
  selectedSpaceId: string | null
  selectedWorkflowId: string | null
  contextDefaultWorkflowId: string | null
  activeWorkflowId: string | null
  orgWorkflows: ReturnType<typeof useOrgWorkflow>["workflows"]
}) {
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
  // Built-in steps in the reader's language (German board, German columns); typed names as written.
  const { label: stepLabel } = useStepLabel()
  const boardKanbanColumns = useMemo(
    () => (boardHasWorkflow && boardStatuses.length > 0 ? buildKanbanColumns(boardStatuses, stepLabel) : undefined),
    [boardHasWorkflow, boardStatuses, stepLabel],
  )

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

  return { boardWorkflowCounts, boardWorkflows, boardWorkflowId, boardKanbanColumns, boardTasks }
}

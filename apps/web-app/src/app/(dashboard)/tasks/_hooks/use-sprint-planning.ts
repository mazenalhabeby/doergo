"use client"

import { useState, useMemo, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { sprintsApi, type Task, type Sprint, type Epic } from "@/lib/api"
import type { TaskScope } from "../_lib/task-list"

/**
 * Sprints and epics on the task page: the CRUD dialogs' state, the sprint
 * mutations, and what the page derives from the sprint list and the scope.
 */
export function useSprintPlanning({
  sprints,
  tasks,
  scope,
  setScope,
}: {
  sprints: Sprint[] | undefined
  tasks: Task[]
  scope: TaskScope
  setScope: (scope: TaskScope) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Sprint CRUD state
  const [sprintFormOpen, setSprintFormOpen] = useState(false)
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null)
  const [completingSprint, setCompletingSprint] = useState<Sprint | null>(null)
  const [deletingSprintId, setDeletingSprintId] = useState<string | null>(null)

  // Epic CRUD state
  const [epicFormOpen, setEpicFormOpen] = useState(false)
  const [editingEpic, setEditingEpic] = useState<Epic | null>(null)

  // Sprint mutations
  const startSprintMutation = useMutation({
    mutationFn: (id: string) => sprintsApi.start(id),
    onSuccess: () => {
      notify.sprint("started", t("tasks.notify.sprintStarted"))
      queryClient.invalidateQueries({ queryKey: keys.sprints.lists() })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const completeSprintMutation = useMutation({
    mutationFn: (id: string) => sprintsApi.complete(id),
    onSuccess: () => {
      notify.sprint("completed", t("tasks.notify.sprintCompleted"))
      setCompletingSprint(null)
      setScope("all")
      queryClient.invalidateQueries({ queryKey: keys.sprints.lists() })
      queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteSprintMutation = useMutation({
    mutationFn: (id: string) => sprintsApi.delete(id),
    onSuccess: () => {
      notify.sprint("deleted", t("tasks.notify.sprintRemoved"))
      setDeletingSprintId(null)
      setScope("all")
      queryClient.invalidateQueries({ queryKey: keys.sprints.lists() })
      queryClient.invalidateQueries({ queryKey: keys.tasks.lists(), refetchType: "all" })
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

  // Tasks in the selected sprint (unfiltered — for sprint indicator)
  const sprintScopedTasks = useMemo(() => {
    if (scope === "all" || scope === "backlog") return []
    return tasks.filter((t: Task) => t.sprintId === scope)
  }, [tasks, scope])

  // Incomplete tasks in selected sprint (for complete sprint dialog)
  const incompleteSprintTasks = useMemo(() => {
    return sprintScopedTasks.filter((t: Task) => !["COMPLETED", "CLOSED", "CANCELED"].includes(t.status))
  }, [sprintScopedTasks])

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
    const donePoints = sprintScopedTasks.filter((t: Task) => t.status === "COMPLETED" || t.status === "CLOSED").reduce(
      (sum: number, t: Task) => sum + (t.storyPoints || 0),
      0)
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

  /** "New sprint" from anywhere on the page. */
  const openNewSprint = () => { setEditingSprint(null); setSprintFormOpen(true) }
  /** "New epic" from anywhere on the page. */
  const openNewEpic = () => { setEditingEpic(null); setEpicFormOpen(true) }

  return {
    sprintFormOpen, editingSprint, completingSprint, setCompletingSprint, deletingSprintId, setDeletingSprintId,
    epicFormOpen, setEpicFormOpen, editingEpic, setEditingEpic,
    startSprintMutation, completeSprintMutation, deleteSprintMutation,
    effectiveSprints, hasActiveSprint, nextPlanningSprint, nextSprintNumber, lastSprintEndDate, selectedSprint,
    handleSprintFormClose, handleEditSprint, handleCompleteSprintClick, handleCompleteSprintConfirm,
    sprintScopedTasks, incompleteSprintTasks, sprintDropdownLabel, sprintIndicator, averageVelocity, sprintTeamSize,
    openNewSprint, openNewEpic,
  }
}

export type SprintPlanning = ReturnType<typeof useSprintPlanning>

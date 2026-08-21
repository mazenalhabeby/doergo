"use client"

import React, { useState, useMemo, useRef, useCallback } from "react"
import type { Phase } from "@/lib/api"
import { useTranslation } from "react-i18next"
import { ChevronRight, User, Archive, Layers, Plus, Inbox } from "lucide-react"
import { cn } from "@/lib/utils"
import { getPriorityConfig } from "@/lib/constants"
import type { Task, Sprint, Epic } from "@/lib/api"
import type { TaskContextMenuActions } from "./task-context-menu"
import { TaskTableRow } from "./task-table-row"

export type GroupByOption = "none" | "sprint" | "epic" | "assignee" | "priority" | "space"

interface GroupDef {
  key: string
  label: string
  sublabel?: string
  dotColor?: string
  icon?: React.ReactNode
}

interface GroupedListProps {
  tasks: Task[]
  groupBy: GroupByOption
  sprints?: Sprint[]
  epics?: Epic[]
  spaces?: { id: string; name: string }[]
  canAssign?: boolean
  onAssign?: (taskId: string) => void
  onGroupChange?: (taskId: string, updates: Record<string, string | null>) => void
  onReorder?: (taskId: string, newPosition: number, groupKey: string) => void
  onCreateSprint?: () => void
  onCreateEpic?: () => void
  contextActions?: TaskContextMenuActions
  phases?: Phase[]
  recentAssignees?: { id: string; firstName: string; lastName: string }[]
}

// ─── Group field mapping ────────────────────────────────────────────────────

function getGroupField(groupBy: GroupByOption): string | null {
  switch (groupBy) {
    case "sprint": return "sprintId"
    case "epic": return "epicId"
    case "assignee": return "assignedToId"
    case "priority": return "priority"
    case "space": return "spaceId"
    default: return null
  }
}

// ─── Build groups from tasks ────────────────────────────────────────────────

function buildGroups(
  groupBy: GroupByOption, tasks: Task[], sprints: Sprint[], epics: Epic[], spaces: { id: string; name: string }[],
  t: (key: string) => string,
): { groups: GroupDef[]; tasksByGroup: Map<string, Task[]> } {
  const tasksByGroup = new Map<string, Task[]>()
  const addTask = (key: string, task: Task) => { if (!tasksByGroup.has(key)) tasksByGroup.set(key, []); tasksByGroup.get(key)!.push(task) }

  switch (groupBy) {
    case "sprint": {
      const groups: GroupDef[] = [...sprints]
        .sort((a, b) => { const o: Record<string, number> = { ACTIVE: 0, PLANNING: 1, COMPLETED: 2 }; return (o[a.status] ?? 9) - (o[b.status] ?? 9) })
        .map(s => ({ key: s.id, label: s.name, sublabel: s.status === "ACTIVE" ? t("common.active") : s.status === "PLANNING" ? t("tasks.groups.planning") : t("tasks.statusTabs.COMPLETED"), dotColor: s.status === "ACTIVE" ? "#22C55E" : s.status === "PLANNING" ? "#3B82F6" : "#94A3B8" }))
      groups.push({ key: "__none__", label: t("tasks.groups.backlog"), icon: <Archive className="size-3.5" />, dotColor: "#94A3B8" })
      for (const g of groups) tasksByGroup.set(g.key, [])
      for (const t of tasks) addTask(t.sprintId || "__none__", t)
      return { groups, tasksByGroup }
    }
    case "epic": {
      const groups: GroupDef[] = epics.map(e => ({ key: e.id, label: e.name, dotColor: e.color }))
      groups.push({ key: "__none__", label: t("tasks.groups.noEpic"), dotColor: "#94A3B8" })
      for (const g of groups) tasksByGroup.set(g.key, [])
      for (const t of tasks) addTask(t.epicId || "__none__", t)
      return { groups, tasksByGroup }
    }
    case "assignee": {
      const map = new Map<string, { id: string; first: string; last: string }>()
      for (const t of tasks) {
        if (t.assignees?.length) { const l = t.assignees.find(a => a.role === "LEAD") || t.assignees[0]; if (l) map.set(l.user.id, { id: l.user.id, first: l.user.firstName, last: l.user.lastName }) }
        else if (t.assignedTo) map.set(t.assignedTo.id, { id: t.assignedTo.id, first: t.assignedTo.firstName, last: t.assignedTo.lastName })
      }
      const groups: GroupDef[] = Array.from(map.values()).sort((a, b) => `${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`)).map(a => ({ key: a.id, label: `${a.first} ${a.last}` }))
      groups.push({ key: "__none__", label: t("tasks.progress.unassigned"), icon: <User className="size-3.5 text-muted-foreground/50" />, dotColor: "#94A3B8" })
      for (const g of groups) tasksByGroup.set(g.key, [])
      for (const t of tasks) {
        let id: string | null = null
        if (t.assignees?.length) { const l = t.assignees.find(a => a.role === "LEAD"); id = l?.user.id || t.assignees[0]?.user.id || null }
        else if (t.assignedTo) id = t.assignedTo.id
        addTask(id || "__none__", t)
      }
      return { groups, tasksByGroup }
    }
    case "priority": {
      const groups: GroupDef[] = ["URGENT", "HIGH", "MEDIUM", "LOW"].map(p => { const c = getPriorityConfig(p); return { key: p, label: c.label, dotColor: c.hex } })
      for (const g of groups) tasksByGroup.set(g.key, [])
      for (const t of tasks) addTask(t.priority || "MEDIUM", t)
      return { groups, tasksByGroup }
    }
    case "space": {
      const groups: GroupDef[] = spaces.map(s => ({ key: s.id, label: s.name, icon: <Layers className="size-3.5 text-muted-foreground" /> }))
      groups.push({ key: "__none__", label: t("tasks.groups.noSpace"), dotColor: "#94A3B8" })
      for (const g of groups) tasksByGroup.set(g.key, [])
      for (const t of tasks) addTask(t.spaceId || "__none__", t)
      return { groups, tasksByGroup }
    }
    default:
      return { groups: [], tasksByGroup: new Map() }
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function GroupedList({
  tasks, groupBy, sprints = [], epics = [], spaces = [],
  canAssign, onAssign, onGroupChange, onReorder, onCreateSprint, onCreateEpic,
  contextActions, phases, recentAssignees,
}: GroupedListProps) {
  const { t } = useTranslation()
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [overGroupKey, setOverGroupKey] = useState<string | null>(null)
  const [insertIndex, setInsertIndex] = useState<{ groupKey: string; index: number } | null>(null)

  const { groups, tasksByGroup } = useMemo(() => {
    const result = buildGroups(groupBy, tasks, sprints, epics, spaces, t)
    // Sort tasks within each group by position for consistent reorder persistence
    for (const [, groupTasks] of result.tasksByGroup) {
      groupTasks.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    }
    return result
  }, [groupBy, tasks, sprints, epics, spaces, t])

  const visibleGroups = useMemo(
    () => groupBy === "sprint" || groupBy === "epic"
      ? groups // show all groups including empty ones for sprint/epic
      : groups.filter(g => (tasksByGroup.get(g.key) || []).length > 0),
    [groups, tasksByGroup, groupBy],
  )

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // Track source group for same-group detection
  const sourceGroupRef = useRef<string | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string, sourceGroup: string) => {
    e.dataTransfer.setData("text/plain", taskId)
    e.dataTransfer.setData("application/x-source-group", sourceGroup)
    e.dataTransfer.effectAllowed = "move"
    setDraggingTaskId(taskId)
    sourceGroupRef.current = sourceGroup
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggingTaskId(null)
    setOverGroupKey(null)
    setInsertIndex(null)
    sourceGroupRef.current = null
  }, [])

  React.useEffect(() => {
    document.addEventListener("dragend", handleDragEnd)
    return () => document.removeEventListener("dragend", handleDragEnd)
  }, [handleDragEnd])

  // Calculate insert index when dragging over a row
  const handleRowDragOver = useCallback((e: React.DragEvent, groupKey: string, rowIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "move"
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const newIndex = e.clientY < midY ? rowIndex : rowIndex + 1
    setInsertIndex({ groupKey, index: newIndex })
    setOverGroupKey(groupKey)
  }, [])

  const handleRowDrop = useCallback((e: React.DragEvent, groupKey: string) => {
    e.preventDefault()
    e.stopPropagation()
    const taskId = e.dataTransfer.getData("text/plain")
    const sourceGroup = e.dataTransfer.getData("application/x-source-group")

    setDraggingTaskId(null)
    setOverGroupKey(null)
    const currentInsert = insertIndex
    setInsertIndex(null)
    sourceGroupRef.current = null

    if (!taskId || !sourceGroup) return

    // Same group — reorder
    if (sourceGroup === groupKey && onReorder && currentInsert) {
      onReorder(taskId, currentInsert.index, groupKey)
      return
    }

    // Different group — change group field
    const field = getGroupField(groupBy)
    if (field) {
      const value = groupKey === "__none__" ? null : groupKey
      onGroupChange?.(taskId, { [field]: value })
    }
  }, [groupBy, onGroupChange, onReorder, insertIndex])

  const handleGroupDrop = useCallback((e: React.DragEvent, targetGroupKey: string) => {
    e.preventDefault()
    const taskId = e.dataTransfer.getData("text/plain")
    const sourceGroup = e.dataTransfer.getData("application/x-source-group")

    setDraggingTaskId(null)
    setOverGroupKey(null)
    const currentInsert = insertIndex
    setInsertIndex(null)
    sourceGroupRef.current = null

    if (!taskId || !sourceGroup) return

    // Same group — reorder (if we have an insert position)
    if (sourceGroup === targetGroupKey && onReorder && currentInsert) {
      onReorder(taskId, currentInsert.index, targetGroupKey)
      return
    }

    // Skip if same group without reorder
    if (sourceGroup === targetGroupKey) return

    const field = getGroupField(groupBy)
    if (field) {
      const value = targetGroupKey === "__none__" ? null : targetGroupKey
      onGroupChange?.(taskId, { [field]: value })
    }
  }, [groupBy, onGroupChange, onReorder, insertIndex])

  if (visibleGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Inbox className="size-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-foreground">{t("tasks.groups.noTasksToGroup")}</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">{t("tasks.groups.noTasksToGroupHint")}</p>
      </div>
    )
  }

  const canCreate = (groupBy === "sprint" && onCreateSprint) || (groupBy === "epic" && onCreateEpic)
  const createLabel = groupBy === "sprint" ? t("tasks.groups.newSprint") : groupBy === "epic" ? t("tasks.groups.newEpic") : null
  const handleCreate = groupBy === "sprint" ? onCreateSprint : groupBy === "epic" ? onCreateEpic : undefined

  return (
    <div className="space-y-3">
      {visibleGroups.map(group => {
        const groupTasks = tasksByGroup.get(group.key) || []
        const isCollapsed = collapsedGroups.has(group.key)
        const isGroupOver = overGroupKey === group.key && draggingTaskId !== null

        return (
          <div
            key={group.key}
            className={cn(
              "bg-card rounded-xl border overflow-hidden transition-all duration-150",
              isGroupOver ? "border-blue-400/60 ring-1 ring-blue-400/20" : "border-border/60",
            )}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move" }}
            onDragEnter={(e) => { e.preventDefault(); setOverGroupKey(group.key) }}
            onDragLeave={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              const { clientX: x, clientY: y } = e
              if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                setOverGroupKey(null)
              }
            }}
            onDrop={(e) => handleGroupDrop(e, group.key)}
          >
            {/* Group header */}
            <button
              onClick={() => toggleGroup(group.key)}
              className={cn(
                "w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors",
                isGroupOver && "bg-blue-50/50 dark:bg-blue-500/[0.05]",
              )}
            >
              <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform duration-200", !isCollapsed && "rotate-90")} />
              {group.icon && <span className="flex-shrink-0">{group.icon}</span>}
              {group.dotColor && !group.icon && <span className="size-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.dotColor }} />}
              <span className="text-sm font-semibold text-foreground">{group.label}</span>
              {group.sublabel && <span className="text-xs text-muted-foreground">{group.sublabel}</span>}
              <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md font-medium tabular-nums">
                {groupTasks.length}
              </span>
              {isGroupOver && draggingTaskId && (
                <span className="ml-auto text-xs font-medium text-blue-600 dark:text-blue-400">{t("tasks.groups.dropHere")}</span>
              )}
            </button>

            {/* Task rows */}
            {!isCollapsed && (
              <div>
                {groupTasks.map((task, index) => (
                  <React.Fragment key={task.id}>
                    {/* Drop indicator before this row */}
                    {insertIndex?.groupKey === group.key && insertIndex.index === index && draggingTaskId && draggingTaskId !== task.id && (
                      <div className="relative h-0.5 z-10">
                        <div className="absolute inset-x-4 top-0 h-[2px] bg-blue-500 rounded-full" />
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-blue-500" />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-blue-500" />
                      </div>
                    )}
                    <div
                      onDragOver={(e) => handleRowDragOver(e, group.key, index)}
                      onDrop={(e) => handleRowDrop(e, group.key)}
                    >
                      <TaskTableRow
                        task={task}
                        index={index}
                        canAssign={canAssign || false}
                        onAssign={onAssign || (() => {})}
                        draggable
                        onDragStart={(e, taskId) => handleDragStart(e, taskId, group.key)}
                        isDragging={draggingTaskId === task.id}
                        sprints={sprints}
                        phases={phases}
                        epics={epics}
                        spaces={spaces}
                        contextActions={contextActions}
                        recentAssignees={recentAssignees}
                      />
                    </div>
                  </React.Fragment>
                ))}
                {/* Drop indicator at end of list */}
                {insertIndex?.groupKey === group.key && insertIndex.index === groupTasks.length && draggingTaskId && (
                  <div className="relative h-0.5 z-10">
                    <div className="absolute inset-x-4 top-0 h-[2px] bg-blue-500 rounded-full" />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-blue-500" />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-blue-500" />
                  </div>
                )}
                {/* Empty group state */}
                {groupTasks.length === 0 && draggingTaskId && (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground/50">
                    {t("tasks.groups.dropTaskHere")}
                  </div>
                )}
                {groupTasks.length === 0 && !draggingTaskId && (
                  <div className="px-4 py-5 text-center text-xs text-muted-foreground">
                    {t("tasks.groups.noTasksInGroup")}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Create new sprint/epic button */}
      {canCreate && createLabel && (
        <button
          onClick={handleCreate}
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30 transition-colors"
        >
          <Plus className="size-3.5" />
          {createLabel}
        </button>
      )}
    </div>
  )
}

"use client"

import React, { useState, useMemo, useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { ChevronRight, Plus, Inbox } from "lucide-react"
import { cn } from "@/lib/utils"
import { TaskTableRow } from "./task-table-row"
import { type GroupedListProps, getGroupField, buildGroups } from "./group-by-option"
export { type GroupByOption } from "./group-by-option"

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
              "overflow-hidden rounded-[24px] bg-card px-2 pb-2 shadow-shell transition-all duration-150",
              isGroupOver && "ring-2 ring-ring",
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
                "flex w-full items-center gap-2 rounded-[14px] px-3 pb-2 pt-4 text-left text-[13px] font-semibold " +
                  "text-muted-foreground outline-none transition-colors hover:text-foreground " +
                  "focus-visible:ring-2 focus-visible:ring-ring",
                isGroupOver && "bg-shell-accent-soft",
              )}
            >
              <ChevronRight
                className={cn("size-3.5 text-muted-foreground transition-transform duration-200", !isCollapsed && "rotate-90")}
              />
              {group.icon && <span className="flex-shrink-0">{group.icon}</span>}
              {group.dotColor &&
                !group.icon &&
                <span className="size-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.dotColor }} />}
              <span className="font-semibold text-foreground">{group.label}</span>
              {group.sublabel && <span className="text-xs text-muted-foreground">{group.sublabel}</span>}
              <span className="font-medium tabular-nums text-muted-foreground/70">{groupTasks.length}</span>
              {isGroupOver && draggingTaskId && (
                <span className="ml-auto text-xs font-semibold text-shell-accent">{t("tasks.groups.dropHere")}</span>
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
                        <div className="absolute inset-x-4 top-0 h-[2px] bg-shell-accent rounded-full" />
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-shell-accent" />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-shell-accent" />
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
                    <div className="absolute inset-x-4 top-0 h-[2px] bg-shell-accent rounded-full" />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-shell-accent" />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-shell-accent" />
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
          className={
            "flex h-11 w-full items-center gap-2 rounded-full border border-dashed border-border px-4 text-sm " +
            "font-semibold text-muted-foreground transition-colors hover:bg-shell-chip hover:text-foreground"
          }
        >
          <Plus className="size-3.5" />
          {createLabel}
        </button>
      )}
    </div>
  )
}

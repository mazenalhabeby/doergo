"use client"

import React, { useState, useCallback, useRef } from "react"
import { cn } from "@/lib/utils"
import type { Task, Sprint, Phase, Epic } from "@/lib/api"
import type { TaskContextMenuActions } from "./task-context-menu"
import { TaskCard } from "./task-card"

/** One column of the kanban board: its header, WIP limit, cards, and the drop/reorder targets between them. */

interface KanbanColumnProps {
  label: string
  dotColor: string
  tasks: Task[]
  dropStatus: string
  wipLimit?: number
  draggingId: string | null
  onDragStart: (taskId: string) => void
  onDrop: (taskId: string, newStatus: string) => void
  onReorder?: (taskId: string, newPosition: number, status: string) => void
  onDragEnd: () => void
  onAssignClick?: (taskId: string) => void
  contextActions?: TaskContextMenuActions
  sprints?: Sprint[]
  phases?: Phase[]
  epics?: Epic[]
  spaces?: { id: string; name: string }[]
  recentAssignees?: { id: string; firstName: string; lastName: string }[]
  /** Can this task move at all? Resolved once by the board, from the same rule
   *  the service applies, so a card only lifts when a drop would be accepted. */
  canMoveTask: (task: Task) => boolean
}

export const KanbanColumn = React.memo(function KanbanColumn({
  label,
  dotColor,
  tasks,
  dropStatus,
  wipLimit,
  draggingId,
  onDragStart,
  onDrop,
  onReorder,
  onDragEnd,
  onAssignClick,
  contextActions,
  sprints,
  phases,
  epics,
  spaces,
  recentAssignees,
  canMoveTask,
}: KanbanColumnProps) {
  const [isOver, setIsOver] = useState(false)
  const [insertIndex, setInsertIndex] = useState<number | null>(null)
  const dragCounterRef = useRef(0)

  const isAtLimit = wipLimit != null && tasks.length === wipLimit
  const isOverLimit = wipLimit != null && tasks.length > wipLimit

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    setIsOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsOver(false)
      setInsertIndex(null)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      dragCounterRef.current = 0
      setIsOver(false)
      const taskId = e.dataTransfer.getData("text/plain")
      if (!taskId) {
        onDragEnd()
        return
      }

      // Check if this is a same-column drop (reorder)
      const draggedTask = tasks.find((t) => t.id === taskId)
      if (draggedTask && onReorder && insertIndex !== null) {
        // Same column — reorder
        onReorder(taskId, insertIndex, dropStatus)
      } else if (taskId) {
        onDrop(taskId, dropStatus)
      }
      setInsertIndex(null)
      onDragEnd()
    },
    [onDrop, onReorder, dropStatus, onDragEnd, tasks, insertIndex],
  )

  // Calculate insert index from drag position over a card
  const handleCardDragOver = useCallback((e: React.DragEvent, cardIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "move"
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const newIndex = e.clientY < midY ? cardIndex : cardIndex + 1
    setInsertIndex(newIndex)
  }, [])

  const handleCardDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current = 0
      setIsOver(false)
      const taskId = e.dataTransfer.getData("text/plain")
      if (!taskId) {
        onDragEnd()
        return
      }

      const draggedTask = tasks.find((t) => t.id === taskId)
      if (draggedTask && onReorder && insertIndex !== null) {
        onReorder(taskId, insertIndex, dropStatus)
      } else if (taskId) {
        onDrop(taskId, dropStatus)
      }
      setInsertIndex(null)
      onDragEnd()
    },
    [onDrop, onReorder, dropStatus, onDragEnd, tasks, insertIndex],
  )

  const dropIndicator = (
    <div className="relative h-0.5 -my-0.5 z-10">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-shell-accent rounded-full" />
      <div className="absolute left-0 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-shell-accent" />
      <div className="absolute right-0 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-shell-accent" />
    </div>
  )

  const renderTasks = (laneTasks: Task[]) => {
    const items: React.ReactNode[] = []
    for (let i = 0; i < laneTasks.length; i++) {
      const task = laneTasks[i]!
      // Show drop indicator before this card
      if (insertIndex === i && draggingId && draggingId !== task.id) {
        items.push(<React.Fragment key={`indicator-${i}`}>{dropIndicator}</React.Fragment>)
      }
      items.push(
        <div
          key={task.id}
          // Focusable and named, so the board is reachable without a mouse:
          // dragging is pointer-only, and the context menu (Menu key / Shift+F10
          // on the focused card) is the keyboard path to move a task. Screen
          // readers announce the card and the column it currently sits in.
          role="listitem"
          tabIndex={0}
          aria-label={`${task.title} — ${label}`}
          className={
            "rounded-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ring " +
            "focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          }
          onDragOver={(e) => handleCardDragOver(e, i)}
          onDrop={handleCardDrop}
        >
          <TaskCard
            task={task}
            index={i}
            isDragging={draggingId === task.id}
            onAssignClick={onAssignClick}
            contextActions={contextActions}
            sprints={sprints}
            phases={phases}
            epics={epics}
            spaces={spaces}
            recentAssignees={recentAssignees}
            /*
              Draggable only when the task can actually move — the same rule the
              service applies (hasAnyTransition / mayChangeStatus in
              @hbcfield/shared). A manager may free-move an active card; a
              finished one may only make its declared step, so COMPLETED still
              lifts (it can be closed) while CANCELED and CLOSED do not.
            */
            dragProps={
              !canMoveTask(task)
                ? undefined
                : {
                    onDragStart: (e) => {
                      e.dataTransfer.setData("text/plain", task.id)
                      e.dataTransfer.effectAllowed = "move"
                      onDragStart(task.id)
                    },
                  }
            }
          />
        </div>,
      )
    }
    // Show drop indicator at the end
    if (insertIndex === laneTasks.length && draggingId) {
      items.push(<React.Fragment key="indicator-end">{dropIndicator}</React.Fragment>)
    }
    return items
  }

  return (
    // Columns stretch to fill the viewport down to (roughly) the footer so the
    // board doesn't leave a big empty area beneath short columns. The body is
    // flex-1, so it grows to fill this min-height.
    <div
      className={cn(
        "flex min-h-[calc(100vh-340px)] w-[280px] flex-shrink-0 flex-col rounded-[24px] p-3.5 transition-colors duration-200",
        isOver
          ? "bg-shell-nav-on"
          : isOverLimit
            ? "bg-[color-mix(in_srgb,var(--shell-crit)_9%,hsl(var(--muted)))]"
            : isAtLimit
              ? "bg-[color-mix(in_srgb,var(--shell-warn)_11%,hsl(var(--muted)))]"
              : "bg-muted",
      )}
    >
      {/* Column Header */}
      <div className="mb-2.5 flex items-center gap-2 px-1.5 pt-0.5 text-[13px] font-semibold text-muted-foreground">
        <span className="size-2 rounded-full" style={{ backgroundColor: dotColor }} />
        <span className="text-foreground">{label}</span>
        <span
          className={cn(
            "font-medium tabular-nums",
            isOverLimit ? "text-shell-crit" : isAtLimit ? "text-shell-warn" : "text-muted-foreground/70",
          )}
        >
          {wipLimit != null ? `${tasks.length} / ${wipLimit}` : tasks.length}
        </span>
      </div>

      {/* Column Body -- drop zone */}
      <div
        className="min-h-[200px] flex-1 space-y-2.5"
        // A named list, so a screen reader announces which column it entered
        // and how many cards it holds.
        role="list"
        aria-label={`${label} (${tasks.length})`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {tasks.length === 0 ? (
          <div
            className={cn(
              "flex h-full min-h-[200px] items-center justify-center rounded-[18px] border-2 border-dashed transition-colors",
              isOver ? "border-ring" : "border-transparent",
            )}
          >
            <p className="text-xs text-muted-foreground">{isOver ? "Drop here" : "No tasks"}</p>
          </div>
        ) : (
          renderTasks(tasks)
        )}
      </div>
    </div>
  )
})

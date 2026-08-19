"use client"

import React, { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Task, Sprint, Phase, Epic } from "@/lib/api"
import { useOrgWorkflow, buildKanbanColumns, type KanbanColumnDef } from "@/hooks/use-org-workflow"
import type { TaskContextMenuActions } from "./task-context-menu"
import { isFinishedStatus } from "@hbcfield/shared/client"
import { TaskCard } from "./task-card"

// Hardcoded fallback columns (used when no workflow exists)
const FALLBACK_COLUMNS: KanbanColumnDef[] = [
  { key: "open", label: "Open", dotColor: "#3B82F6", statuses: ["NEW"], dropStatus: "NEW" },
  { key: "assigned", label: "Assigned", dotColor: "#8B5CF6", statuses: ["ASSIGNED", "ACCEPTED"], dropStatus: "ASSIGNED" },
  { key: "active", label: "Active", dotColor: "#F59E0B", statuses: ["EN_ROUTE", "ARRIVED", "IN_PROGRESS"], dropStatus: "IN_PROGRESS", wipLimit: 5 },
  { key: "blocked", label: "Blocked", dotColor: "#EF4444", statuses: ["BLOCKED"], dropStatus: "BLOCKED", wipLimit: 3 },
  { key: "done", label: "Done", dotColor: "#22C55E", statuses: ["COMPLETED", "CLOSED"], dropStatus: "COMPLETED" },
]

// ─── Column ──────────────────────────────────────────────────────────────────

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
}

const KanbanColumn = React.memo(function KanbanColumn({
  label, dotColor, tasks, dropStatus, wipLimit, draggingId, onDragStart, onDrop, onReorder, onDragEnd,
  onAssignClick, contextActions, sprints, phases, epics, spaces, recentAssignees,
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsOver(false)
    const taskId = e.dataTransfer.getData("text/plain")
    if (!taskId) { onDragEnd(); return }

    // Check if this is a same-column drop (reorder)
    const draggedTask = tasks.find(t => t.id === taskId)
    if (draggedTask && onReorder && insertIndex !== null) {
      // Same column — reorder
      onReorder(taskId, insertIndex, dropStatus)
    } else if (taskId) {
      onDrop(taskId, dropStatus)
    }
    setInsertIndex(null)
    onDragEnd()
  }, [onDrop, onReorder, dropStatus, onDragEnd, tasks, insertIndex])

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

  const handleCardDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsOver(false)
    const taskId = e.dataTransfer.getData("text/plain")
    if (!taskId) { onDragEnd(); return }

    const draggedTask = tasks.find(t => t.id === taskId)
    if (draggedTask && onReorder && insertIndex !== null) {
      onReorder(taskId, insertIndex, dropStatus)
    } else if (taskId) {
      onDrop(taskId, dropStatus)
    }
    setInsertIndex(null)
    onDragEnd()
  }, [onDrop, onReorder, dropStatus, onDragEnd, tasks, insertIndex])

  const dropIndicator = (
    <div className="relative h-0.5 -my-0.5 z-10">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-blue-500 rounded-full" />
      <div className="absolute left-0 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-blue-500" />
      <div className="absolute right-0 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-blue-500" />
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
          className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background"
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
              A finished task is not draggable. The server refuses to move it —
              a completed task may only be closed, a canceled or closed one
              nothing at all — so offering the drag produced a card that slid
              into a column and snapped back with an error. It also disagreed
              with the task's own page, which offers nothing once finished.
            */
            dragProps={
              isFinishedStatus(task.status)
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
        </div>
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
    <div className="flex-shrink-0 w-[280px] flex flex-col min-h-[calc(100vh-340px)]">
      {/* Column Header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="size-2 rounded-full" style={{ backgroundColor: dotColor }} />
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className={cn(
          "text-xs px-1.5 py-0.5 rounded-md font-medium",
          isOverLimit
            ? "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-950"
            : isAtLimit
              ? "text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-950"
              : "text-muted-foreground bg-muted",
        )}>
          {wipLimit != null ? `${tasks.length} / ${wipLimit}` : tasks.length}
        </span>
      </div>

      {/* Column Body -- drop zone */}
      <div
        className={cn(
          "flex-1 space-y-2 min-h-[200px] p-2 rounded-xl border transition-all duration-200",
          isOver
            ? "bg-primary/[0.06] border-primary/30 shadow-inner"
            : isOverLimit
              ? "bg-red-50/50 border-red-300 dark:bg-red-950/20 dark:border-red-800"
              : isAtLimit
                ? "bg-amber-50/50 border-amber-300 dark:bg-amber-950/20 dark:border-amber-800"
                : "bg-muted/50 border-border/40",
        )}
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
          <div className={cn(
            "flex items-center justify-center h-full min-h-[200px] rounded-lg border-2 border-dashed transition-colors duration-200",
            isOver ? "border-primary/40 bg-primary/[0.04]" : "border-transparent",
          )}>
            <p className="text-xs text-muted-foreground/50">
              {isOver ? "Drop here" : "No tasks"}
            </p>
          </div>
        ) : (
          renderTasks(tasks)
        )}
      </div>
    </div>
  )
})

// ─── Board ───────────────────────────────────────────────────────────────────

interface KanbanBoardProps {
  tasks: Task[]
  columns?: KanbanColumnDef[]
  onStatusChange?: (taskId: string, newStatus: string) => void
  onReorder?: (taskId: string, newPosition: number, status: string) => void
  onAssignClick?: (taskId: string) => void
  contextActions?: TaskContextMenuActions
  sprints?: Sprint[]
  phases?: Phase[]
  epics?: Epic[]
  spaces?: { id: string; name: string }[]
  recentAssignees?: { id: string; firstName: string; lastName: string }[]
}

export function KanbanBoard({
  tasks,
  columns: columnsProp,
  onStatusChange,
  onReorder,
  onAssignClick,
  contextActions,
  sprints,
  phases,
  epics,
  spaces,
  recentAssignees,
}: KanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const { statuses: workflowStatuses, hasWorkflow } = useOrgWorkflow()

  // Build columns: prefer prop (space-aware), then org workflow, then fallback
  const columnDefs = useMemo(() => {
    if (columnsProp && columnsProp.length > 0) return columnsProp
    if (hasWorkflow && workflowStatuses.length > 0) {
      return buildKanbanColumns(workflowStatuses)
    }
    return FALLBACK_COLUMNS
  }, [columnsProp, hasWorkflow, workflowStatuses])

  const handleDragStart = useCallback((taskId: string) => {
    setDraggingId(taskId)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggingId(null)
  }, [])

  const handleDrop = useCallback((taskId: string, newStatus: string) => {
    setDraggingId(null)
    // Don't trigger if dropping on the same column
    const task = tasks.find(t => t.id === taskId)
    if (task && task.status === newStatus) return
    onStatusChange?.(taskId, newStatus)
  }, [onStatusChange, tasks])

  const columns = columnDefs.map((col) => ({
    ...col,
    tasks: tasks
      .filter((t) => col.statuses.includes(t.status))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
  }))

  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollIndicators = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollIndicators()
    el.addEventListener("scroll", updateScrollIndicators, { passive: true })
    const ro = new ResizeObserver(updateScrollIndicators)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", updateScrollIndicators)
      ro.disconnect()
    }
  }, [updateScrollIndicators])

  return (
    <div className="relative -mx-6">
      {/* Left edge -- gradient fade + arrow */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-4 z-20 flex items-center transition-opacity duration-300",
          canScrollLeft ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <div className="absolute inset-0 w-16 pointer-events-none" style={{ background: "linear-gradient(to right, hsl(var(--background)), transparent)" }} />
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: -300, behavior: "smooth" })}
          className="relative ml-2 w-7 h-7 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ChevronLeft className="size-3.5" />
        </button>
      </div>
      {/* Right edge -- gradient fade + arrow */}
      <div
        className={cn(
          "absolute right-0 top-0 bottom-4 z-20 flex items-center justify-end transition-opacity duration-300",
          canScrollRight ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <div className="absolute inset-0 w-16 pointer-events-none" style={{ background: "linear-gradient(to left, hsl(var(--background)), transparent)" }} />
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: 300, behavior: "smooth" })}
          className="relative mr-2 w-7 h-7 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 px-6 scrollbar-hide"
        onDragEnd={handleDragEnd}
      >
      {columns.map((col) => (
        <KanbanColumn
          key={col.key}
          label={col.label}
          dotColor={col.dotColor}
          tasks={col.tasks}
          dropStatus={col.dropStatus}
          wipLimit={col.wipLimit}
          draggingId={draggingId}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
          onReorder={onReorder}
          onDragEnd={handleDragEnd}
          onAssignClick={onAssignClick}
          contextActions={contextActions}
          sprints={sprints}
          phases={phases}
          epics={epics}
          spaces={spaces}
          recentAssignees={recentAssignees}
        />
      ))}
    </div>
    </div>
  )
}

"use client"

import React, { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Task, Sprint, Phase, Epic } from "@/lib/api"
import { useOrgWorkflow, buildKanbanColumns, type KanbanColumnDef } from "@/hooks/use-org-workflow"
import { useStepLabel } from "@/hooks/use-step-config"
import type { TaskContextMenuActions } from "./task-context-menu"
import { isFinishedStatus, hasAnyTransition, STATUS_TRANSITIONS } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { KanbanColumn } from "./kanban-column"

// Hardcoded fallback columns (used when no workflow exists)
const FALLBACK_COLUMNS: KanbanColumnDef[] = [
  { key: "open", label: "Open", dotColor: "#3B82F6", statuses: ["NEW"], dropStatus: "NEW" },
  {
    key: "assigned",
    label: "Assigned",
    dotColor: "#8B5CF6",
    statuses: ["ASSIGNED", "ACCEPTED"],
    dropStatus: "ASSIGNED",
  },
  {
    key: "active",
    label: "Active",
    dotColor: "#F59E0B",
    statuses: ["EN_ROUTE", "ARRIVED", "IN_PROGRESS"],
    dropStatus: "IN_PROGRESS",
    wipLimit: 5,
  },
  { key: "blocked", label: "Blocked", dotColor: "#EF4444", statuses: ["BLOCKED"], dropStatus: "BLOCKED", wipLimit: 3 },
  { key: "done", label: "Done", dotColor: "#22C55E", statuses: ["COMPLETED", "CLOSED"], dropStatus: "COMPLETED" },
]

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
  const { user, hasPermission } = useAuth()

  /*
    What a card may do, decided by the same rule the service enforces.

    A manager may free-move an ACTIVE card, which is what a board is for. A
    finished one is held to its declared transitions — so a COMPLETED card
    still lifts, because it can be closed, while CANCELED and CLOSED do not.
  */
  const isManager = user?.role === "ADMIN" || hasPermission("canViewAllTasks")
  const targetsFor = useCallback(
    (status: string): string[] => {
      if (hasWorkflow) {
        const cur = workflowStatuses.find((st) => st.key === status)
        return cur?.transitions ?? []
      }
      return (STATUS_TRANSITIONS[status as keyof typeof STATUS_TRANSITIONS] ?? []) as string[]
    },
    [hasWorkflow, workflowStatuses],
  )

  const finishedFor = useCallback(
    (status: string): boolean => {
      if (hasWorkflow) {
        const cur = workflowStatuses.find((st) => st.key === status)
        return !!cur?.isFinal || !!cur?.isCanceled
      }
      return isFinishedStatus(status)
    },
    [hasWorkflow, workflowStatuses],
  )

  const canMoveTask = useCallback(
    (task: Task) =>
      hasAnyTransition({
        allowedTargets: targetsFor(task.status),
        isManager,
        fromIsFinished: finishedFor(task.status),
      }),
    [targetsFor, finishedFor, isManager],
  )

  // Build columns: prefer prop (space-aware), then org workflow, then fallback
  const { label: stepLabel } = useStepLabel()
  const columnDefs = useMemo(() => {
    if (columnsProp && columnsProp.length > 0) return columnsProp
    if (hasWorkflow && workflowStatuses.length > 0) {
      return buildKanbanColumns(workflowStatuses, stepLabel)
    }
    return FALLBACK_COLUMNS
  }, [columnsProp, hasWorkflow, workflowStatuses, stepLabel])

  const handleDragStart = useCallback((taskId: string) => {
    setDraggingId(taskId)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggingId(null)
  }, [])

  const handleDrop = useCallback(
    (taskId: string, newStatus: string) => {
      setDraggingId(null)
      // Don't trigger if dropping on the same column
      const task = tasks.find((t) => t.id === taskId)
      if (task && task.status === newStatus) return
      onStatusChange?.(taskId, newStatus)
    },
    [onStatusChange, tasks],
  )

  const columns = columnDefs.map((col) => ({
    ...col,
    tasks: tasks.filter((t) => col.statuses.includes(t.status)).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
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
        <div
          className="absolute inset-0 w-16 pointer-events-none"
          style={{ background: "linear-gradient(to right, hsl(var(--background)), transparent)" }}
        />
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: -300, behavior: "smooth" })}
          className={"relative ml-2 w-7 h-7 rounded-full bg-card border border-border " +
            "shadow-md flex items-center justify-center text-muted-foreground " +
            "hover:text-foreground hover:bg-accent transition-colors"}
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
        <div
          className="absolute inset-0 w-16 pointer-events-none"
          style={{ background: "linear-gradient(to left, hsl(var(--background)), transparent)" }}
        />
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: 300, behavior: "smooth" })}
          className={"relative mr-2 w-7 h-7 rounded-full bg-card border border-border " +
            "shadow-md flex items-center justify-center text-muted-foreground " +
            "hover:text-foreground hover:bg-accent transition-colors"}
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-4 px-6 scrollbar-hide" onDragEnd={handleDragEnd}>
        {columns.map((col) => (
          <KanbanColumn
            canMoveTask={canMoveTask}
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

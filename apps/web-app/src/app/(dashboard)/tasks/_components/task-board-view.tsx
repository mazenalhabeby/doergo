"use client"

import type { ComponentProps } from "react"

import type { Task } from "@/lib/api"
import type { useOrgWorkflow } from "@/hooks/use-org-workflow"
import { cn } from "@/lib/utils"
import { KanbanBoard } from "./kanban-board"
import type { TaskViewContext } from "../_lib/task-list"

/** Board View — always flat kanban, one task type at a time. */
export function TaskBoardView({
  tasks,
  columns,
  boardWorkflows,
  boardWorkflowId,
  boardWorkflowCounts,
  onSelectWorkflow,
  onStatusChange,
  onReorder,
  onAssignClick,
  context: { sprints, phases, epics, spaces, contextActions, recentAssignees },
}: {
  tasks: Task[]
  columns: ComponentProps<typeof KanbanBoard>["columns"]
  boardWorkflows: ReturnType<typeof useOrgWorkflow>["workflows"]
  boardWorkflowId: string | null
  boardWorkflowCounts: Map<string, number>
  onSelectWorkflow: (workflowId: string) => void
  onStatusChange: (taskId: string, newStatus: string) => void
  onReorder: (taskId: string, newPosition: number, status: string) => void
  onAssignClick: (taskId: string) => void
  context: TaskViewContext
}) {
  return (
    <div data-tour="tasks-board">
      {/* Task Type tabs — a board shows one workflow at a time (columns differ
              per type). Shown only when the SPACE's tasks span more than one type;
              each tab is a type that actually has tasks here (not every org workflow). */}
      {boardWorkflows.length > 1 && (
        <div className="mb-4 inline-flex max-w-full flex-wrap items-center gap-1 rounded-full bg-shell-chip p-1">
          {boardWorkflows.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => onSelectWorkflow(w.id)}
              className={cn(
                "inline-flex h-[34px] items-center gap-2 rounded-full px-3.5 text-[13.5px] font-medium transition-colors",
                boardWorkflowId === w.id
                  ? "bg-card font-semibold text-foreground shadow-shell"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {w.name}
              <span
                className={cn(
                  "text-[11.5px] font-semibold tabular-nums",
                  boardWorkflowId === w.id ? "text-muted-foreground" : "text-muted-foreground/70",
                )}
              >
                {boardWorkflowCounts.get(w.id) ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}
      <KanbanBoard
        tasks={tasks}
        columns={columns}
        onStatusChange={onStatusChange}
        onReorder={onReorder}
        onAssignClick={onAssignClick}
        contextActions={contextActions}
        sprints={sprints}
        phases={phases}
        epics={epics}
        spaces={spaces}
        recentAssignees={recentAssignees}
      />
    </div>
  )
}

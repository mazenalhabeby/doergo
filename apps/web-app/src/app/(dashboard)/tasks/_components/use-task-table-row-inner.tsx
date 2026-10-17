"use client"

import { personName, isOpenToRole } from "@hbcfield/shared/client"
import { OpenRoleChip } from "./open-role-chip"
import { flowIdOf, stepConfig, useStepLabel } from "@/hooks/use-step-config"
import { PausedChip } from "@/components/paused-chip"
import React from "react"
import {
  isTaskOverdue,
  isFinishedStatus,
  mayChangeStatus,
  hasAnyTransition,
  STATUS_TRANSITIONS,
} from "@hbcfield/shared/client"
import { useWorkflow } from "@/hooks/use-org-workflow"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { GripVertical, UserPlus, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { TaskAssigneesStack, TaskPersonAvatar } from "./task-avatars"
import { useAuth } from "@/contexts/auth-context"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { getStatusConfig, getPriorityConfig, TASK_STATUSES } from "@/lib/constants"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Task, Sprint, Phase, Epic } from "@/lib/api"
import { type TaskContextMenuActions } from "./task-context-menu"
import { dateLocale } from "@/lib/format-date"
import { useTaskTableRowInnerData, type TaskTableRowProps } from "./use-task-table-row-inner-data"
export { type TaskTableRowProps } from "./use-task-table-row-inner-data"

/** TaskTableRowInner's state and handlers — everything before its markup, moved here unchanged. */
export function useTaskTableRowInner({
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
}: Pick<TaskTableRowProps, 'task' | 'index' | 'canAssign' | 'onAssign' | 'sprints' | 'phases' | 'epics' | 'spaces' | 'contextActions' | 'recentAssignees' | 'draggable' | 'onDragStart' | 'isDragging'>) {
  const {
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
  } = useTaskTableRowInnerData({ task, index, canAssign, onAssign, sprints, phases, epics, spaces, contextActions, recentAssignees, draggable, onDragStart, isDragging })

  const rowContent = (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id)
        e.dataTransfer.effectAllowed = "move"
        if (onDragStart) onDragStart(e, task.id)
      }}
      onClick={handleRowClick}
      className={cn(
        "group grid grid-cols-[24px_1fr_100px_160px_110px_110px_40px] items-center px-3 h-11",
        "border-b border-border/20 last:border-b-0",
        "hover:bg-muted/40 transition-colors duration-100",
        "cursor-pointer select-none",
        isDragging && "opacity-30 scale-[0.98]",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      {/* Drag handle — only visible when draggable */}
      <div
        data-no-navigate
        className={cn(
          "flex items-center justify-center transition-opacity",
          draggable ? "opacity-0 group-hover:opacity-40" : "opacity-0",
        )}
      >
        {draggable && <GripVertical className="size-3.5" />}
      </div>

      {/* Title + Status Dot */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="size-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusConfig.hex }} />
        <span className="text-sm font-medium text-foreground truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-100">
          {task.title}
        </span>
        <PausedChip task={task} className="flex-shrink-0" />
      </div>

      {/* Priority */}
      <div className="flex items-center gap-1.5 w-[100px] flex-shrink-0">
        <PriorityIcon className="size-3.5 flex-shrink-0" style={{ color: priorityConfig.hex }} />
        <span className="text-xs font-medium" style={{ color: priorityConfig.hex }}>
          {priorityConfig.label}
        </span>
        {hasModule('story_points') && task.storyPoints != null && (
          <span className="bg-muted rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground ml-1">
            {task.storyPoints}
          </span>
        )}
      </div>

      {/* Assignee(s) — clickable to open assign dialog */}
      <div
        data-no-navigate
        className="flex items-center gap-2 min-w-0 w-[160px] flex-shrink-0 rounded-md px-1.5 py-1 -mx-1.5 hover:bg-muted/60 cursor-pointer transition-colors"
        onClick={(e) => { e.stopPropagation(); onAssign(task.id) }}
        /* A truncated name is unreadable on its own, so the tooltip carries who
           is on the task as well as what clicking does. */
        title={
          [
            task.assignees?.length
              ? task.assignees.map((a) => personName(a.user)).join(", ")
              : task.assignedTo
                ? personName(task.assignedTo)
                : "",
            t("tasks.row.manageAssignees"),
          ].filter(Boolean).join(" — ")
        }
      >
        {task.assignees && task.assignees.length > 0 ? (
          /*
            min-w-0 on the INNER row too, not just the cell.

            A flex item's default min-width is auto, so this div refused to
            shrink below its content and the `truncate` on the name never
            engaged — a long name simply overflowed the 160px cell and ran
            across the due date beside it. The outer cell had min-w-0; the row
            inside it did not, and that is the one the text lives in.
          */
          <div className="flex items-center min-w-0">
            <span className="flex-shrink-0">
              <TaskAssigneesStack assignees={task.assignees} />
            </span>
            {task.assignees.length <= 2 && (
              <span className="text-xs text-muted-foreground truncate ml-2">
                {personName(task.assignees[0]!.user)}
              </span>
            )}
          </div>
        ) : task.assignedTo ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <TaskPersonAvatar person={task.assignedTo} />
            <span className="text-xs text-muted-foreground truncate">
              {personName(task.assignedTo)}
            </span>
          </div>
        ) : isOpenToRole(task) ? (
          <OpenRoleChip task={task} />
        ) : (
          <span className="text-xs text-muted-foreground/40 flex items-center gap-1">
            <UserPlus className="size-3" />
            {t("tasks.card.assign")}
          </span>
        )}
      </div>

      {/* Due Date */}
      <div className="flex items-center gap-1.5 w-[110px] flex-shrink-0">
        {formattedDueDate ? (
          <span className={cn("text-xs", isOverdue ? "text-red-500 font-medium" : "text-muted-foreground")}>
            {formattedDueDate}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/30">—</span>
        )}
      </div>

      {/*
        Status — a control, not a label.

        Changing it here was possible all along, but only by right-clicking the
        row, which nobody discovers. On the board the same action is a drag you
        can see. This is the third way of doing one thing, so it opens the same
        list the context menu does. A finished task stays a plain badge: the
        server will not move it, so nothing here should suggest otherwise.
      */}
      <div className="w-[110px] flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {canChangeStatus ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={t("tasks.menu.status")}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ backgroundColor: `${statusConfig.hex}14`, color: statusConfig.hex }}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: statusConfig.hex }} />
                {statusConfig.label}
                <ChevronDown className="size-2.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[180px]">
              {statusOptions.map((opt) => {
                // Shown, but only selectable when the move would be accepted —
                // the same rule the service applies.
                const permitted = mayChangeStatus({
                  from: task.status,
                  to: opt.key,
                  allowedTargets,
                  targetIsValidStatus: true,
                  isManager,
                  fromIsFinished: currentIsFinished,
                })
                return (
                  <DropdownMenuItem
                    key={opt.key}
                    disabled={!permitted}
                    onClick={() => contextActions!.onStatusChange!(task.id, opt.key)}
                    className={!permitted ? "opacity-50" : ""}
                  >
                    <span className="size-2 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: opt.hex }} />
                    {opt.label}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
            style={{ backgroundColor: `${statusConfig.hex}14`, color: statusConfig.hex }}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: statusConfig.hex }} />
            {statusConfig.label}
          </span>
        )}
      </div>

      {/* Spacer for grid alignment */}
      <div />
    </div>
  )

  return { rowContent }
}

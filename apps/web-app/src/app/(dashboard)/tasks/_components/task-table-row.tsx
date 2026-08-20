"use client"

import React from "react"
import { isTaskOverdue, isFinishedStatus, mayChangeStatus, hasAnyTransition, STATUS_TRANSITIONS } from "@hbcfield/shared/client"
import { useWorkflow } from "@/hooks/use-org-workflow"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import {
  GripVertical,
  UserPlus,
  ChevronDown,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { UserAvatar, StackedAvatars } from "@/components/user-avatar"
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
import { TaskContextMenu, type TaskContextMenuActions } from "./task-context-menu"

interface TaskTableRowProps {
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

function TaskTableRowInner({
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
}: TaskTableRowProps) {
  const { t } = useTranslation()
/*
    Modules are the SPACE's, and a board can show tasks from several spaces at
    once — so the row asks about its OWN task's space rather than the
    organization's set. Cached per space by the hook, so a board of fifty rows
    from three spaces makes three lookups, not fifty.
  */
  const { hasModule: orgHasModule, user } = useAuth()
  const { hasModule: spaceHasModule } = useSpaceModules(task.spaceId ?? null)
  const hasModule = task.spaceId ? spaceHasModule : orgHasModule
  const router = useRouter()
  const statusConfig = getStatusConfig(task.status)

  /*
    The statuses THIS task can be in — its own task type's, not a fixed list.

    The dropdown listed the canonical statuses regardless of the task's type, so
    a task on a custom flow was offered columns that do not exist in it. It
    reads the task's workflow now, falling back to the canonical machine only
    when the task has none.
  */
  const { statuses: flowStatuses, hasWorkflow: taskHasWorkflow } = useWorkflow(task.workflowId)
  const statusOptions = taskHasWorkflow && flowStatuses.length
    ? flowStatuses.map((st) => ({ key: st.key, label: st.name, hex: st.color }))
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

  const isManager = user?.role === "ADMIN" || user?.canViewAllTasks === true

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
    ? new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on action buttons or drag handle
    const target = e.target as HTMLElement
    if (target.closest("[data-no-navigate]")) return
    router.push(`/tasks/${task.id}`)
  }

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
              ? task.assignees.map((a) => `${a.user.firstName} ${a.user.lastName}`).join(", ")
              : task.assignedTo
                ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}`
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
              <StackedAvatars
                users={task.assignees.map((a) => ({ id: a.user.id, firstName: a.user.firstName, lastName: a.user.lastName, avatarUrl: a.user.avatarUrl }))}
                max={3}
                size="xs"
              />
            </span>
            {task.assignees.length <= 2 && (
              <span className="text-xs text-muted-foreground truncate ml-2">
                {task.assignees[0]!.user.firstName} {task.assignees[0]!.user.lastName}
              </span>
            )}
          </div>
        ) : task.assignedTo ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <UserAvatar
              firstName={task.assignedTo.firstName}
              lastName={task.assignedTo.lastName}
              avatarUrl={task.assignedTo.avatarUrl}
              seed={task.assignedTo.id}
              size="xs"
            />
            <span className="text-xs text-muted-foreground truncate">
              {task.assignedTo.firstName} {task.assignedTo.lastName}
            </span>
          </div>
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

  if (contextActions) {
    return (
      <TaskContextMenu
        task={task}
        sprints={sprints}
        phases={phases}
        epics={epics}
        spaces={spaces}
        actions={contextActions}
        recentAssignees={recentAssignees}
      >
        {rowContent}
      </TaskContextMenu>
    )
  }

  return rowContent
}

export const TaskTableRow = React.memo(TaskTableRowInner)

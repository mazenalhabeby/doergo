"use client"

import { personName, isOpenToRole } from "@hbcfield/shared/client"
import { OpenRoleChip } from "./open-role-chip"

import { flowIdOf, stepConfig, useStepLabel } from "@/hooks/use-step-config"
import { PausedChip } from "@/components/paused-chip"
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
import { TaskContextMenu, type TaskContextMenuActions } from "./task-context-menu"
import { dateLocale } from "@/lib/format-date"
import { useTaskTableRowInner, type TaskTableRowProps } from "./use-task-table-row-inner"

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
  const {
    rowContent
  } = useTaskTableRowInner({
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
    draggable,
    onDragStart,
    isDragging
  })

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

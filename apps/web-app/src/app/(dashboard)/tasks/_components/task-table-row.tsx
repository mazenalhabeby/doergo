"use client"


import React from "react"

import { TaskContextMenu } from "./task-context-menu"
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

"use client"

import type { Task } from "@/lib/api"
import { useTranslation } from "react-i18next"

export interface TaskDetailSidebarProps {
  task: Task
  canEdit: boolean
  /** Adding/removing assignees is a different permission from editing fields —
   *  the server requires canAssignTasks for it, not canCreateTasks. */
  canAssign: boolean
  hasModule: (m: string) => boolean
  onFieldSave: (field: string, value: string) => Promise<void> | void
  onAssignClick: () => void
  onRemoveAssignee?: (assigneeId: string) => void
  onSetLead?: (assigneeId: string) => void
  sprints?: { id: string; name: string; status: string }[]
  phases?: { id: string; name: string; color: string }[]
  epics?: { id: string; name: string; color: string }[]
}

/** TaskDetailSidebar's state and handlers — everything before its markup, moved here unchanged. */
export function useTaskDetailSidebar({
  task,
  canEdit,
  canAssign,
  hasModule,
  onFieldSave,
  onAssignClick,
  onRemoveAssignee,
  onSetLead,
  sprints = [],
  phases = [],
  epics = [],
}: Pick<TaskDetailSidebarProps, 'task' | 'canEdit' | 'canAssign' | 'hasModule' | 'onFieldSave' | 'onAssignClick' | 'onRemoveAssignee' | 'onSetLead' | 'sprints' | 'phases' | 'epics'>) {
  const { t } = useTranslation()
  const hasAgile = hasModule("sprints") || hasModule("phases") || hasModule("epics") || hasModule("story_points")
  const assignees = task.assignees || []
  const hasMultiple = assignees.length > 1
  const leadCount = assignees.filter((a) => a.role === "LEAD").length

  return { t, hasAgile, assignees, hasMultiple, leadCount }
}

/** What TaskDetailSidebar and its sections read. */
export type TaskDetailSidebarState = ReturnType<typeof useTaskDetailSidebar>

import type { Task } from "@/lib/api"

/** What the job page hands its right-hand column. */
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

"use client"

import { AssignMemberDialog } from "@/components/assign-member-dialog"
import { HandoverPendingNotice } from "@/components/handover-pending-notice"
import type { Task } from "@/lib/api"
import type { TaskAssign } from "../_hooks/use-task-assign"

/** The assign dialog for the task the list opened it on. */
export function TaskAssignDialog({
  assign,
  tasks,
  selectedSpaceId,
}: {
  assign: TaskAssign
  tasks: Task[]
  selectedSpaceId: string | null
}) {
  const {
    assignDialogOpen, setAssignDialogOpen,
    selectedTaskId, setSelectedTaskId,
    handoverPending, reassignNote, setReassignNote,
    assignMutation, saveAssignees,
  } = assign

  return (
    <AssignMemberDialog
      open={assignDialogOpen}
      onOpenChange={(open) => {
        setAssignDialogOpen(open)
        if (!open) setSelectedTaskId(null)
      }}
      taskId={selectedTaskId}
      spaceId={selectedTaskId ? (tasks.find((t: Task) => t.id === selectedTaskId)?.spaceId ?? selectedSpaceId) : selectedSpaceId}
      currentAssigneeId={selectedTaskId ? (tasks.find((t: Task) => t.id === selectedTaskId)?.assignedToId ?? null) : null}
      currentAssigneeIds={selectedTaskId ? (tasks.find((t: Task) => t.id === selectedTaskId)?.assignees?.map((a) => a.userId) ?? []) : []}
      isAssigning={assignMutation.isPending}
      notice={handoverPending ? <HandoverPendingNotice text={handoverPending} onWait={() => { setAssignDialogOpen(false); setSelectedTaskId(null) }} note={reassignNote} onNoteChange={setReassignNote} /> : null}
      onAssign={(memberId) => assignMutation.mutate(memberId)}
      onSave={saveAssignees}
    />
  )
}

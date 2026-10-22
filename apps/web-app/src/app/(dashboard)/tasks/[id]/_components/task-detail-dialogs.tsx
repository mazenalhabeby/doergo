"use client"

import type { ComponentProps, ReactNode } from "react"
import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { keys } from "@/lib/query-keys"
import { tasksApi, type Task } from "@/lib/api"
import { notify } from "@/lib/toast"
import { useLatched } from "@/hooks/use-latched"
import { HandoverPendingNotice } from "@/components/tasks/handover-pending-notice"
import type { ClockGateDialog as ClockGateDialogView } from "@/components/tasks/clock-gate-dialog"
import type { OfficeStartDialog as OfficeStartDialogView } from "@/components/tasks/office-start-dialog"

/*
  Loaded when they are needed, not with the page: each dialog opens on a click
  (or a refused move) and arrives as its own chunk the moment it is about to show.
*/
const EditTaskDialog = dynamic(() => import("./edit-task-dialog").then((m) => m.EditTaskDialog), { ssr: false })

const AssignMemberDialog = dynamic(
  () => import("@/components/tasks/assign-member-dialog").then((m) => m.AssignMemberDialog),
  { ssr: false },
)

const ClockGateDialog = dynamic(() => import("@/components/tasks/clock-gate-dialog").then((m) => m.ClockGateDialog), {
  ssr: false,
})

const OfficeStartDialog = dynamic(
  () => import("@/components/tasks/office-start-dialog").then((m) => m.OfficeStartDialog),
  { ssr: false },
)

interface TaskDetailDialogsProps {
  taskId: string
  task: Task
  showAssignModal: boolean
  setShowAssignModal: (open: boolean) => void
  showEditDialog: boolean
  setShowEditDialog: (open: boolean) => void
  isAssigning: boolean
  onAssign: (memberId: string) => void
  /** "Mike hasn't written a handover yet", or null when nothing is owed. */
  handoverPending: string | null
  reassignNote: string
  setReassignNote: (note: string) => void
  clockGateDialog: ComponentProps<typeof ClockGateDialogView>
  officeStartDialog: ComponentProps<typeof OfficeStartDialogView>
  /** The step form a move asks for, when one is open. */
  stepMoveDialog: ReactNode
}

/** The job page's dialogs: assign, edit, "clock in first", the office starting somebody's job, a step's form. */
export function TaskDetailDialogs({
  taskId: id,
  task,
  showAssignModal,
  setShowAssignModal,
  showEditDialog,
  setShowEditDialog,
  isAssigning,
  onAssign,
  handoverPending,
  reassignNote,
  setReassignNote,
  clockGateDialog,
  officeStartDialog,
  stepMoveDialog,
}: TaskDetailDialogsProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // A lazily loaded dialog mounts the first time it opens and stays (its close animates).
  const editMounted = useLatched(showEditDialog)
  const assignMounted = useLatched(showAssignModal)
  const clockGateMounted = useLatched(clockGateDialog.open)
  const officeStartMounted = useLatched(officeStartDialog.open)

  return (
    <>
      {assignMounted && (
        <AssignMemberDialog
          open={showAssignModal}
          onOpenChange={setShowAssignModal}
          taskId={id}
          spaceId={task?.spaceId}
          currentAssigneeId={task?.assignedToId}
          currentAssigneeIds={task?.assignees?.map((a) => a.userId) || []}
          isAssigning={isAssigning}
          notice={
            handoverPending ? (
              <HandoverPendingNotice
                text={handoverPending}
                onWait={() => setShowAssignModal(false)}
                note={reassignNote}
                onNoteChange={setReassignNote}
              />
            ) : null
          }
          onAssign={onAssign}
          onSave={async (added, removed) => {
            const ops: Promise<unknown>[] = [
              ...removed.map((uid) => tasksApi.removeAssignee(id, uid)),
              ...added.map((uid) => tasksApi.addAssignee(id, uid)),
            ]
            await Promise.allSettled(ops)
            // The note for whoever takes the job over — posted here too, not only on a single reassign.
            if (added.length && reassignNote.trim()) {
              await tasksApi.addComment(id, reassignNote.trim()).catch(() => undefined)
              setReassignNote("")
            }
            notify.success(t("tasks.detail.assigneesUpdated"))
            queryClient.invalidateQueries({ queryKey: keys.tasks.detail(id), refetchType: "all" })
          }}
        />
      )}
      {editMounted && <EditTaskDialog task={task} open={showEditDialog} onOpenChange={setShowEditDialog} />}
      {clockGateMounted && <ClockGateDialog {...clockGateDialog} />}
      {officeStartMounted && <OfficeStartDialog {...officeStartDialog} />}
      {stepMoveDialog}
    </>
  )
}

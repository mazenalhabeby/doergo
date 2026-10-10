"use client"

import dynamic from "next/dynamic"

import type { SprintPlanning } from "../_hooks/use-sprint-planning"

// Lazy (audit T-C1): the dialogs render on a click.
const SprintFormDialog = dynamic(() => import("./sprint-management").then((m) => m.SprintFormDialog), { ssr: false })
const CompleteSprintDialog = dynamic(() => import("./sprint-management").then((m) => m.CompleteSprintDialog), { ssr: false })
const DeleteSprintDialog = dynamic(() => import("./sprint-management").then((m) => m.DeleteSprintDialog), { ssr: false })
const EpicFormDialog = dynamic(() => import("./sprint-management").then((m) => m.EpicFormDialog), { ssr: false })

/** The sprint and epic dialogs: create/edit a sprint, complete it, delete it, create/edit an epic. */
export function TaskPlanningDialogs({ planning }: { planning: SprintPlanning }) {
  const {
    sprintFormOpen, handleSprintFormClose, editingSprint, nextSprintNumber, lastSprintEndDate,
    completingSprint, setCompletingSprint, nextPlanningSprint, incompleteSprintTasks,
    handleCompleteSprintConfirm, completeSprintMutation,
    deletingSprintId, setDeletingSprintId, deleteSprintMutation,
    epicFormOpen, setEpicFormOpen, editingEpic, setEditingEpic,
  } = planning

  return (
    <>
      <SprintFormDialog
        open={sprintFormOpen}
        onOpenChange={handleSprintFormClose}
        sprint={editingSprint}
        nextSprintNumber={nextSprintNumber}
        lastSprintEndDate={lastSprintEndDate}
      />

      <CompleteSprintDialog
        open={!!completingSprint}
        onOpenChange={(v) => !v && setCompletingSprint(null)}
        sprint={completingSprint}
        nextSprint={nextPlanningSprint}
        incompleteTasks={incompleteSprintTasks}
        onConfirm={handleCompleteSprintConfirm}
        isPending={completeSprintMutation.isPending}
      />

      <DeleteSprintDialog
        open={!!deletingSprintId}
        onOpenChange={(v) => !v && setDeletingSprintId(null)}
        onConfirm={() => deletingSprintId && deleteSprintMutation.mutate(deletingSprintId)}
        isPending={deleteSprintMutation.isPending}
      />

      <EpicFormDialog
        open={epicFormOpen}
        onOpenChange={(v) => { setEpicFormOpen(v); if (!v) setEditingEpic(null) }}
        epic={editingEpic}
      />
    </>
  )
}

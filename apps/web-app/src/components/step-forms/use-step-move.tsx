"use client"

import { useCallback, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { workflowStatusLabel, type StepForm, type StepFormAnswers, type StepFormSource } from "@hbcfield/shared/client"

import { useAuth } from "@/contexts/auth-context"
import { tasksApi, type Task } from "@/lib/api"
import { getStatusConfig } from "@/lib/constants"
import { isAssignedTo } from "@/lib/task-assignment"
import { isStepFormRefusal, stepFormForMove, type MoverWorkflow } from "@/lib/step-forms"
import dynamic from "next/dynamic"

/*
  Loaded when a move actually asks for a form — the form renderer (photos,
  signatures, every field type) is not part of opening a board or a task.
*/
const StepMoveDialog = dynamic(() => import("./step-move-dialog").then((m) => m.StepMoveDialog), { ssr: false })

export type StepMoveResult = "moved" | "cancelled"

export interface StepMoveRequest {
  task: Pick<Task, "id" | "assignedToId" | "assignees">
  /** The step's key. */
  status: string
  /** The workflow the job runs on, as this page knows it (statuses with their forms). */
  workflow: (MoverWorkflow & { statuses?: ReadonlyArray<{ key: string; name?: string; nameKey?: string | null }> | null }) | null | undefined
  /** Send the status change — with the answers when the step asked something. Throws the refusal. */
  send: (answers?: StepFormAnswers) => Promise<unknown>
}

interface Pending {
  taskId: string
  stepName: string
  form: StepForm
  source: StepFormSource
  send: (answers?: StepFormAnswers) => Promise<unknown>
  resolve: (r: StepMoveResult) => void
}

/**
 * Every web path that moves a job goes through `move`.
 *
 * It decides — by the server's own rule — whether the step asks something of
 * THIS mover. If not, the move is sent as before. If so, the step's dialog opens
 * and the move goes out only with its answers. `move` resolves "cancelled" when
 * the dialog is closed, so a board can put a dragged card back.
 *
 * The page's picture of the workflow can be out of date (or, on the list, a
 * guess at the effective one). A move sent without answers that the server
 * refuses for want of them is therefore not an error to show: the job's own
 * effective workflow is read and its form asked for, once.
 */
export function useStepMove(): { move: (req: StepMoveRequest) => Promise<StepMoveResult>; dialog: ReactNode } {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  pendingRef.current = pending

  const move = useCallback(
    async (req: StepMoveRequest): Promise<StepMoveResult> => {
      const isAssignee = isAssignedTo(req.task as Task, user?.id)
      let workflow = req.workflow
      let decided = stepFormForMove({ workflow, statusKey: req.status, isAssignee })

      if (!decided) {
        try {
          await req.send(undefined)
          return "moved"
        } catch (err) {
          if (!isStepFormRefusal(err)) throw err
          const fresh = await tasksApi.getById(req.task.id).catch(() => null)
          workflow = fresh?.workflow ?? null
          decided = stepFormForMove({ workflow, statusKey: req.status, isAssignee })
          if (!decided) throw err
        }
      }

      const row = workflow?.statuses?.find((s) => s.key === req.status) as { name?: string; nameKey?: string | null } | undefined
      const stepName = row?.name
        ? workflowStatusLabel({ name: row.name, nameKey: row.nameKey ?? null }, (k, o) => t(k, o))
        : getStatusConfig(req.status).label

      const { form, source } = decided
      return new Promise<StepMoveResult>((resolve) => {
        setPending({ taskId: req.task.id, stepName, form, source, send: req.send, resolve })
      })
    },
    [user?.id, t],
  )

  const dialog = pending ? (
    <StepMoveDialog
      key={`${pending.taskId}-${pending.stepName}`}
      open
      taskId={pending.taskId}
      stepName={pending.stepName}
      form={pending.form}
      legacy={pending.source === "legacy"}
      onSubmit={async (answers) => {
        const p = pendingRef.current
        if (!p) return
        await p.send(answers)
        setPending(null)
        p.resolve("moved")
      }}
      onCancel={() => {
        const p = pendingRef.current
        setPending(null)
        p?.resolve("cancelled")
      }}
    />
  ) : null

  return { move, dialog }
}

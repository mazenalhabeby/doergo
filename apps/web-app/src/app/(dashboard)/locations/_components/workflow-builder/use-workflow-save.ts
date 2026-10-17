"use client"

import { keys } from "@/lib/query-keys"
import { useState, type Dispatch, type SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { notify } from "@/lib/toast"

import { workflowsApi, type WorkflowStatus } from "@/lib/api"
import { resolveTransitions, toStatusKey } from "@/lib/workflow-transitions"
import { definitionErrors, definitionRefusal, draftChanged, draftToPayload } from "@/lib/step-forms"
import type { StatusEntry } from "./types"

/*
  One key form for the whole screen.

  This used to lowercase while the generated transition targets uppercased, and
  it only worked because the server uppercases keys on write — a coincidence
  holding two halves of the same feature together. Both sides call the same
  function now.
*/
export const toKey = toStatusKey

interface UseWorkflowSaveArgs {
  mode: "create" | "edit"
  spaceId: string | null
  workflowId?: string
  initialName?: string
  initialStatuses?: WorkflowStatus[]
  name: string
  statuses: StatusEntry[]
  typeCapabilities: string[]
  setStatuses: Dispatch<SetStateAction<StatusEntry[]>>
  setOpenForm: Dispatch<SetStateAction<number | null>>
  onCreated?: (workflowId: string) => void
  onSaved?: () => void
}

/**
 * Saving a flow: create it and its steps, or diff the steps against what was
 * loaded and write only what changed. A step the server refuses is shown on
 * the step itself.
 */
export function useWorkflowSave({
  mode,
  spaceId,
  workflowId,
  initialName,
  initialStatuses,
  name,
  statuses,
  typeCapabilities,
  setStatuses,
  setOpenForm,
  onCreated,
  onSaved,
}: UseWorkflowSaveArgs) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      notify.error(t("workflows.builder.toast.nameRequired"))
      return
    }

    const validStatuses = statuses.filter((s) => s.name.trim())
    if (validStatuses.length === 0) {
      notify.error(t("workflows.builder.toast.statusRequired"))
      return
    }

    // A step whose questions the server would refuse is refused here, on the step.
    const badForm = statuses.findIndex((s) => s.name.trim() && Object.keys(definitionErrors(s.form)).length > 0)
    if (badForm >= 0) {
      setOpenForm(badForm)
      notify.error(
        t(
          "stepForm.saveInvalid",
          { step: statuses[badForm]!.name.trim(), defaultValue: "{{step}}: fix the questions marked in red before saving." }))
      return
    }

    // One step as the API takes it; its questions ride along only when the caller says so.
    type Step = (typeof validStatuses)[number]
    const stepBody = (s: Step, i: number, form: { form?: ReturnType<typeof draftToPayload> }) => ({
      name: s.name.trim(),
      key: toKey(s.name),
      color: s.color,
      position: i,
      isFinal: s.isFinal,
      isCanceled: s.isCanceled,
      transitions: resolveTransitions(validStatuses, i),
      capabilities: s.capabilities ?? [],
      ...form,
    })
    // A new step carries its form when it has one.
    const newStepForm = (s: Step) => (s.form !== null ? { form: draftToPayload(s.form) } : {})
    // A refusal is tagged with the step it came from, so it lands on that step.
    const onStep = (s: Step) => (err: unknown): never => { throw Object.assign(err as object, { stepIndex: statuses.indexOf(s) }) }

    setIsSaving(true)
    try {
      if (mode === "create") {
        // Create the workflow
        const workflow = await workflowsApi.create({
          name: trimmedName,
          capabilities: typeCapabilities,
          ...(spaceId ? { spaceId } : {}),
        })
        if (!workflow) throw new Error(t("workflows.builder.toast.createFailedGeneric"))

        // Add statuses sequentially
        for (let i = 0; i < validStatuses.length; i++) {
          const s = validStatuses[i]!
          await workflowsApi.addStatus(workflow.id, stepBody(s, i, newStepForm(s))).catch(onStep(s))
        }

        queryClient.invalidateQueries({ queryKey: keys.workflows.lists() })
        notify.success(t("workflows.builder.toast.created"))
        onCreated?.(workflow.id)
      } else if (mode === "edit" && workflowId) {
        // Update workflow name if changed
        // Name and type capabilities travel together — one request, and no
        // half-saved state if the second would have failed.
        await workflowsApi.update(workflowId, {
          ...(trimmedName !== initialName ? { name: trimmedName } : {}),
          capabilities: typeCapabilities,
        })

        // Determine added, updated, and removed statuses
        const existingIds = new Set(
          (initialStatuses || []).map((s) => s.id)
        )
        const currentIds = new Set(
          validStatuses.filter((s) => s.id).map((s) => s.id!)
        )

        // Delete removed statuses
        for (const initial of initialStatuses || []) {
          if (!currentIds.has(initial.id)) {
            await workflowsApi.deleteStatus(workflowId, initial.id)
          }
        }

        // Add new statuses and update existing
        for (let i = 0; i < validStatuses.length; i++) {
          const s = validStatuses[i]!
          if (s.id && existingIds.has(s.id)) {
            // Update existing
            const original = initialStatuses?.find((os) => os.id === s.id)
            // Sent only when it changed: omitted leaves the stored form (and its version) alone.
            const formChanged = draftChanged(s.initialForm, s.form)
            if (
              original &&
              (original.name !== s.name.trim() ||
                original.color !== s.color ||
                original.isFinal !== s.isFinal ||
                original.isCanceled !== s.isCanceled ||
                original.position !== i ||
                formChanged)
            ) {
              await workflowsApi.updateStatus(workflowId, s.id, stepBody(s, i, formChanged ? { form: draftToPayload(s.form) } : {})).catch(
                onStep(s))
            }
          } else {
            // Add new
            await workflowsApi.addStatus(workflowId, stepBody(s, i, newStepForm(s))).catch(onStep(s))
          }
        }

        queryClient.invalidateQueries({ queryKey: keys.workflows.lists() })
        notify.success(t("workflows.builder.toast.updated"))
        onSaved?.()
      }
    } catch (err) {
      /*
        A step's questions refused by the server: shown on the step, on the
        fields it names — not as one English sentence in a toast.
      */
      const stepIndex = (err as { stepIndex?: number } | null)?.stepIndex
      const step = stepIndex !== undefined ? statuses[stepIndex] : undefined
      const refusal = step ? definitionRefusal(err, draftToPayload(step.form)?.fields ?? []) : null
      if (step && refusal && stepIndex !== undefined) {
        setStatuses((prev) => prev.map((s, j) => (j === stepIndex ? { ...s, formServerErrors: refusal } : s)))
        setOpenForm(stepIndex)
        notify.error(t("stepForm.saveRefused", { step: step.name.trim(), defaultValue: "{{step}}: some questions were not accepted." }))
      } else {
        notify.error(
          err instanceof Error ? err.message : t("workflows.builder.toast.saveFailed")
        )
      }
    } finally {
      setIsSaving(false)
    }
  }

  return { isSaving, handleSave }
}

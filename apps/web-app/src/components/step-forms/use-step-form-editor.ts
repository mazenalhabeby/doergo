"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { STEP_FORM_LIMITS, type StepFormField, type StepFormFieldType } from "@hbcfield/shared/client"
import { definitionErrors, type DefinitionErrors, type StepFormDraft } from "@/lib/step-forms"

export const TYPE_NAME: Record<StepFormFieldType, string> = {
  note: "Note",
  choice: "Choice",
  photos: "Photos",
  signature: "Signature",
  name: "Name",
  number: "Number",
  yesno: "Yes / no",
  date: "Date",
}

export interface StepFormEditorProps {
  /** The step's name, for the preview. */
  stepName: string
  /** What the step asks as it stands: its own list, the standard report, or nothing. */
  mode: "own" | "legacy" | "none"
  draft: StepFormDraft
  onChange: (draft: StepFormDraft) => void
  /** May this person change it? Otherwise it is shown, not edited. */
  editable: boolean
  /** Does the space (else the organization) run the CRM? Offers the CRM links. */
  crmAvailable: boolean
  /** What the server refused on the last save, by field. */
  serverErrors?: DefinitionErrors
  /** Without its own list this step would ask the standard report — offer the way back to it. */
  standardAvailable?: boolean
}

/** StepFormEditor's state and handlers — everything before its markup, moved here unchanged. */
export function useStepFormEditor(
  {
    stepName,
    mode,
    draft,
    onChange,
    editable,
    crmAvailable,
    serverErrors,
    standardAvailable
  }: Pick<StepFormEditorProps, 'stepName' | 'mode' | 'draft' | 'onChange' | 'editable' | 'crmAvailable' | 'serverErrors' | 'standardAvailable'>) {
  const { t } = useTranslation()
  const tr = (key: string, fallback: string) => t(key, { defaultValue: fallback })
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const fields = draft?.fields ?? []
  const live = definitionErrors(draft)
  const errorsFor = (id: string) => [...(live[id] ?? []), ...(serverErrors?.[id] ?? [])]
  const formErrors = [...(live["*"] ?? []), ...(serverErrors?.["*"] ?? [])]
  const defError = (code: string) =>
    t(
      `stepForm.definitionError.${code}`,
      { defaultValue: t("stepForm.definitionError.invalid", "This question is not valid."), max: STEP_FORM_LIMITS.maxFields })

  const setFields = (next: StepFormField[]) => onChange({ fields: next })
  const update = (i: number, patch: Partial<StepFormField>) => setFields(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const remove = (i: number) => setFields(fields.filter((_, j) => j !== i))

  const typeName = (type: StepFormFieldType) => t(`stepForm.type.${type}`, TYPE_NAME[type])

  return {
    t,
    tr,
    dragFrom,
    setDragFrom,
    dragOver,
    setDragOver,
    fields,
    errorsFor,
    formErrors,
    defError,
    setFields,
    update,
    remove,
    typeName,
  }
}

/** What StepFormEditor and its sections read. */
export type StepFormEditorState = ReturnType<typeof useStepFormEditor>

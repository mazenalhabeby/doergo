/** The form builder's draft: fields, presets, steps and definition errors (moved here unchanged) */
import {
  newStepFormFieldId,
  resolveStepForm,
  stepFormPreset,
  type StepForm,
  type StepFormDefinitionError,
  type StepFormField,
  type StepFormFieldType,
  type StepFormPresetId,
  validateStepFormDefinition,
} from '@hbcfield/shared/client';

/** A server refusal as thrown by the API client (`apiError`). */
interface CodedError {
  code?: string
  params?: Record<string, unknown>
}

/** The refusal a workflow save answers with when a step's form is not acceptable. */
const STEP_FORM_DEFINITION_INVALID = "STEP_FORM_DEFINITION_INVALID"

// ───────────────────────────────────────────────────────── the builder ──

/**
 * A step's form while it is being edited.
 *
 *  - `null`            — NOT SET: the legacy rule decides (a final `report` step
 *                        asks the field-service report, anything else asks nothing)
 *  - `{ fields: [] }`  — set to ask nothing
 *  - `{ fields: [...] }` — the organization's own list
 */
export type StepFormDraft = { fields: StepFormField[] } | null

/** What the API is sent for a step's form: a definition, or null to clear. */
type StepFormPayload = { fields: StepFormField[] } | null

/** A stored form (from the API) as builder state. A copy — the builder edits it. */
export function draftFromStored(stored: StepForm | { fields?: unknown } | null | undefined): StepFormDraft {
  if (stored === null || stored === undefined) return null
  const fields = Array.isArray((stored as { fields?: unknown }).fields) ? ((stored as { fields: StepFormField[] }).fields) : []
  return { fields: fields.map((f) => ({ ...f, ...(f.options ? { options: [...f.options] } : {}) })) }
}

/** Builder state as the API takes it. Trailing blank options are dropped; nothing else is changed. */
export function draftToPayload(draft: StepFormDraft): StepFormPayload {
  if (draft === null) return null
  return {
    fields: draft.fields.map((f) => {
      const out: StepFormField = { id: f.id, type: f.type, label: f.label, required: f.required }
      if (f.type === "choice") out.options = (f.options ?? []).filter((o) => o.trim() !== "")
      if (f.crm) out.crm = f.crm
      return out
    }),
  }
}

/** Did the form change between what was loaded and what is being saved? */
export function draftChanged(initial: StepFormDraft, current: StepFormDraft): boolean {
  return JSON.stringify(draftToPayload(initial)) !== JSON.stringify(draftToPayload(current))
}

/** Move one field from `from` to `to` (both positions in the list). Out of range = unchanged. */
export function moveField<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list]
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

/** The label a new field of each type starts with (the translation key; English default). */
const NEW_FIELD_LABEL: Record<StepFormFieldType, { key: string; en: string }> = {
  note: { key: "stepForm.newLabel.note", en: "Notes" },
  choice: { key: "stepForm.newLabel.choice", en: "Outcome" },
  photos: { key: "stepForm.newLabel.photos", en: "Photos" },
  signature: { key: "stepForm.newLabel.signature", en: "Signature" },
  name: { key: "stepForm.newLabel.name", en: "Name" },
  number: { key: "stepForm.newLabel.number", en: "Number" },
  yesno: { key: "stepForm.newLabel.yesno", en: "Yes or no" },
  date: { key: "stepForm.newLabel.date", en: "Date" },
}

type Translate = (key: string, fallback: string) => string

/** A new field of `type`, labelled in the builder's language, with a fresh id. */
export function newField(type: StepFormFieldType, taken: readonly StepFormField[], tr: Translate): StepFormField {
  const id = newStepFormFieldId(new Set(taken.map((f) => f.id)))
  const label = tr(NEW_FIELD_LABEL[type].key, NEW_FIELD_LABEL[type].en)
  const field: StepFormField = { id, type, label, required: false }
  if (type === "choice") {
    field.options = [tr("stepForm.newLabel.optionA", "Option 1"), tr("stepForm.newLabel.optionB", "Option 2")]
  }
  return field
}

/**
 * A preset copied in as the organization's own fields.
 *
 * The labels (and a choice's options) are written in the BUILDER'S language —
 * once saved they are the organization's text, shown as written everywhere, so
 * a German office starting from "Field service" gets German questions, not
 * English ones it has to retype. Field ids are the preset's own.
 */
export function presetDraft(id: StepFormPresetId, tr: Translate): { fields: StepFormField[] } {
  const preset = stepFormPreset(id)
  return {
    fields: preset.fields.map((f) => ({
      ...f,
      label: tr(`stepForm.presetField.${id}.${f.id}`, f.label),
      ...(f.options
        ? { options: f.options.map((o, i) => tr(`stepForm.presetField.${id}.${f.id}_o${i}`, o)) }
        : {}),
    })),
  }
}

/** "Ask nothing" — set, and empty. On a legacy report step this removes the report. */
export function askNothingDraft(): { fields: StepFormField[] } {
  return { fields: [] }
}

/** A step as the builder holds it, for deciding which form it asks. */
interface BuilderStep {
  key: string
  isFinal?: boolean | null
  capabilities?: readonly string[] | null
  form: StepFormDraft
}

/**
 * What the step asks as it stands in the builder:
 *  - `own`     — its own list (possibly empty = asks nothing)
 *  - `legacy`  — no list; it is a final step with `report`, so it asks the
 *                standard field-service report
 *  - `none`    — no list, and nothing to ask
 */
export function builderStepMode(step: BuilderStep, workflowName?: string | null): "own" | "legacy" | "none" {
  if (step.form !== null) return "own"
  const { source } = resolveStepForm({ key: step.key, isFinal: step.isFinal, capabilities: step.capabilities, form: null }, workflowName)
  return source === "legacy" ? "legacy" : "none"
}

/** Definition problems, grouped by field id ("*" for the form as a whole). */
export type DefinitionErrors = Record<string, StepFormDefinitionError["code"][]>

/**
 * Judge the draft with the shared validator (the same one the server runs) and
 * say which field each problem belongs to. Blank trailing options are ignored,
 * exactly as they are on save.
 */
export function definitionErrors(draft: StepFormDraft): DefinitionErrors {
  if (draft === null) return {}
  const payload = draftToPayload(draft)!
  const res = validateStepFormDefinition(payload)
  if (res.ok) return {}
  return groupDefinitionErrors(res.errors, payload.fields)
}

/** Group definition errors by the field they name (by id, else by position). */
function groupDefinitionErrors(errors: readonly StepFormDefinitionError[], fields: readonly Pick<StepFormField, "id">[]): DefinitionErrors {
  const out: DefinitionErrors = {}
  for (const e of errors) {
    const id = e.fieldId ?? (e.index !== undefined ? fields[e.index]?.id : undefined) ?? "*"
    ;(out[id] ??= []).push(e.code)
  }
  return out
}

/**
 * A workflow save refused because of a step's form → the problems per field.
 * Null when the error is anything else.
 */
export function definitionRefusal(error: unknown, fields: readonly Pick<StepFormField, "id">[]): DefinitionErrors | null {
  const e = error as CodedError | undefined
  if (e?.code !== STEP_FORM_DEFINITION_INVALID) return null
  const errors = Array.isArray(e.params?.errors) ? (e.params!.errors as StepFormDefinitionError[]) : []
  const grouped = groupDefinitionErrors(errors, fields)
  return Object.keys(grouped).length ? grouped : { "*": ["not_object"] }
}

/** Can another field with this CRM link be added? (Each link at most once per step.) */
export function crmLinkFree(fields: readonly StepFormField[], link: "outcome" | "followUp", exceptId?: string): boolean {
  return !fields.some((f) => f.crm === link && f.id !== exceptId)
}

/** The CRM link a field of this type may carry, if any. */
export function crmLinkFor(type: StepFormFieldType): "outcome" | "followUp" | null {
  if (type === "choice") return "outcome"
  if (type === "date") return "followUp"
  return null
}

export type { CodedError, Translate };

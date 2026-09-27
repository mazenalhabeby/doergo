/**
 * Step forms on the web — "Ask when a job moves here".
 *
 * The rules live in shared (`workflows/step-form`): what a definition may be,
 * which form a step asks, whether answers are acceptable. This file is only the
 * web's side of them — turning builder state into what the API takes, deciding
 * whether THIS mover owes answers, and turning refusals back into something a
 * field can show. Pure: no React, no fetch, so every rule here is tested.
 */
import {
  resolveStepForm,
  validateStepFormDefinition,
  validateStepAnswers,
  stepFormPreset,
  newStepFormFieldId,
  STEP_FORM_PRESETS,
  STEP_FORM_LIMITS,
  STEP_FORM_REFUSAL,
  type StepForm,
  type StepFormField,
  type StepFormFieldType,
  type StepFormAnswers,
  type StepFormPresetId,
  type StepFormSource,
  type StepAnswerError,
  type StepFormDefinitionError,
} from "@hbcfield/shared/client"

/** A server refusal as thrown by the API client (`apiError`). */
interface CodedError {
  code?: string
  params?: Record<string, unknown>
}

/** The refusal a workflow save answers with when a step's form is not acceptable. */
export const STEP_FORM_DEFINITION_INVALID = "STEP_FORM_DEFINITION_INVALID"

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
export type StepFormPayload = { fields: StepFormField[] } | null

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
export const NEW_FIELD_LABEL: Record<StepFormFieldType, { key: string; en: string }> = {
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
export interface BuilderStep {
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
export function groupDefinitionErrors(errors: readonly StepFormDefinitionError[], fields: readonly Pick<StepFormField, "id">[]): DefinitionErrors {
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

export { STEP_FORM_LIMITS }

// ─────────────────────────────────────────────────────────── the mover ──

/** A workflow as the mover needs it. */
export interface MoverWorkflow {
  name?: string | null
  statuses?: ReadonlyArray<{ key: string; isFinal?: boolean | null; capabilities?: readonly string[] | null; form?: unknown }> | null
}

/**
 * Does THIS move owe answers, and to which form?
 *
 * The same decision the server makes (`prepareStepSubmission`):
 *  - a step's OWN form is asked of whoever moves the job there — office included
 *  - the LEGACY report (no form, final `report` step) only of the job's own
 *    assignee: an office move of somebody else's job to "Completed" never asked
 *    for a report and still does not
 *
 * A job with no workflow (or a target its workflow does not define) is judged by
 * key alone, which is how the server reads it too.
 */
export function stepFormForMove(args: {
  workflow: MoverWorkflow | null | undefined
  statusKey: string
  isAssignee: boolean
}): { form: StepForm; source: StepFormSource } | null {
  const row = args.workflow?.statuses?.find((s) => s.key === args.statusKey)
  const { form, source } = resolveStepForm(row ? { ...row } : { key: args.statusKey }, args.workflow?.name ?? null)
  if (!form || !source) return null
  if (source === "legacy" && !args.isAssignee) return null
  return { form, source }
}

/** What a member has put into the move dialog, before anything is uploaded. */
export type DraftValue =
  | { kind: "text"; value: string }
  | { kind: "number"; value: string }
  | { kind: "yesno"; value: boolean | null }
  | { kind: "photos"; items: Array<{ key: string; uploadedId?: string }> }
  | { kind: "signature"; dataUrl: string | null; uploadedId?: string }

/** A placeholder id for a file not uploaded yet — shaped like an attachment id so the shared check can judge the rest. */
export const PENDING_FILE_PREFIX = "pending_"

/**
 * The answers to send. Files are named by their uploaded attachment id, or a
 * placeholder while they have not been uploaded (only for a pre-upload check —
 * never sent). A field left empty is left out, so an optional one says nothing.
 */
export function buildAnswers(form: Pick<StepForm, "fields">, values: Record<string, DraftValue | undefined>): StepFormAnswers {
  const out: StepFormAnswers = {}
  for (const f of form.fields) {
    const v = values[f.id]
    if (!v) continue
    switch (f.type) {
      case "note":
      case "name":
      case "choice":
      case "date":
        if (v.kind === "text" && v.value.trim() !== "") out[f.id] = v.value.trim()
        break
      case "number":
        if (v.kind === "number" && v.value.trim() !== "") {
          const n = Number(v.value.replace(",", "."))
          // Not a number is sent as-is so the shared check calls it wrong_type, on the field.
          out[f.id] = Number.isFinite(n) ? n : (v.value as unknown as number)
        }
        break
      case "yesno":
        if (v.kind === "yesno" && v.value !== null) out[f.id] = v.value
        break
      case "photos":
        if (v.kind === "photos" && v.items.length) out[f.id] = v.items.map((it) => it.uploadedId ?? `${PENDING_FILE_PREFIX}${it.key}`)
        break
      case "signature":
        if (v.kind === "signature" && (v.uploadedId || v.dataUrl)) out[f.id] = v.uploadedId ?? `${PENDING_FILE_PREFIX}sig_${f.id}`
        break
    }
  }
  return out
}

/** Answer problems, grouped by field id ("*" for the answers as a whole). */
export type AnswerErrors = Record<string, string[]>

/** Judge answers before anything is uploaded — the same check the server runs again. */
export function checkAnswers(form: Pick<StepForm, "fields">, answers: StepFormAnswers): AnswerErrors {
  const res = validateStepAnswers(form, answers)
  if (res.ok) return {}
  return groupAnswerErrors(res.errors)
}

export function groupAnswerErrors(errors: readonly StepAnswerError[]): AnswerErrors {
  const out: AnswerErrors = {}
  for (const e of errors) (out[e.fieldId || "*"] ??= []).push(e.code)
  return out
}

/**
 * A status change refused because of the answers → what to show on which field.
 * `STEP_FORM_FOREIGN_FILE` names attachment ids; they are mapped back to the
 * fields that hold them, so the member sees WHICH photo was not accepted.
 * Null when the error is anything else.
 */
export function answerRefusal(error: unknown, form: Pick<StepForm, "fields">, sent: StepFormAnswers): AnswerErrors | null {
  const e = error as CodedError | undefined
  if (e?.code === STEP_FORM_REFUSAL.INVALID) {
    const errors = Array.isArray(e.params?.errors) ? (e.params!.errors as StepAnswerError[]) : []
    const grouped = groupAnswerErrors(errors)
    return Object.keys(grouped).length ? grouped : { "*": ["not_object"] }
  }
  if (e?.code === STEP_FORM_REFUSAL.FOREIGN_FILE) {
    const ids = new Set(Array.isArray(e.params?.fileIds) ? (e.params!.fileIds as string[]) : [])
    const out: AnswerErrors = {}
    for (const f of form.fields) {
      const v = sent[f.id]
      const held = Array.isArray(v) ? v : typeof v === "string" ? [v] : []
      if ((f.type === "photos" || f.type === "signature") && held.some((id) => ids.has(id))) out[f.id] = ["invalid_file"]
    }
    return Object.keys(out).length ? out : { "*": ["invalid_file"] }
  }
  return null
}

/** Is this error a step-form refusal of a status change? */
export function isStepFormRefusal(error: unknown): boolean {
  const code = (error as CodedError | undefined)?.code
  return code === STEP_FORM_REFUSAL.INVALID || code === STEP_FORM_REFUSAL.FOREIGN_FILE
}

// ─────────────────────────────────────────────────────── field labels ──

const FIELD_SERVICE = STEP_FORM_PRESETS.fieldService.fields

/**
 * The label to show for a field.
 *
 * The organization's own labels are shown AS WRITTEN — in the builder, the
 * move dialog and the report. The one exception is the standard field-service
 * report a legacy step asks: its six fields carry the preset's fixed ids and
 * English labels, which nobody in the organization wrote, so those (and only
 * those, while still carrying the preset's own English text) are translated.
 */
export function stepFieldLabel(field: Pick<StepFormField, "id" | "label">, tr: Translate): string {
  const preset = FIELD_SERVICE.find((p) => p.id === field.id)
  if (preset && preset.label === field.label) return tr(`stepForm.presetField.fieldService.${field.id}`, field.label)
  return field.label
}

/** Answering a step's form: the form for a move, the answers, their refusals and labels (moved here unchanged) */
import {
  STEP_FORM_PRESETS,
  STEP_FORM_REFUSAL,
  resolveStepForm,
  type StepAnswerError,
  type StepForm,
  type StepFormAnswers,
  type StepFormField,
  type StepFormSource,
  validateStepAnswers,
} from '@hbcfield/shared/client';
import type { CodedError, Translate } from './builder';

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

function groupAnswerErrors(errors: readonly StepAnswerError[]): AnswerErrors {
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

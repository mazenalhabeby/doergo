/**
 * Step forms — "Ask when a job moves here".
 *
 * Every workflow step may carry a FORM: an ordered list of fields the member
 * answers when a job moves INTO that step. The answers are stored as the job's
 * report for that move. This replaces the hard-coded service report (summary,
 * before/after photos, two signatures, a customer name) with the
 * organization's own definition — and lets ANY step ask, not only a final one.
 *
 * ⚠️ PURE AND DEPENDENCY-FREE. The builder, the phone and the server all judge
 * a definition and a set of answers with these functions, so "the phone let
 * me send it" and "the server refused it" can only disagree when the phone is
 * lying — and the server never trusts it: it re-runs `validateStepAnswers`.
 *
 * ⚠️ DATA, NEVER CODE. No formulas, no conditions, no scripts. A field is a
 * type, a label, required-or-not, and (for a choice) its options. Anything
 * else on a definition is refused rather than stored.
 *
 * ⚠️ TWO DIFFERENT "NO FORM"s:
 *   - `form: null` on a step = NOT SET. The legacy rule still applies: a final
 *     step with the `report` capability asks the field-service report
 *     (`effectiveStepForm`), so nothing changes for a workflow until edited.
 *   - `form: { fields: [] }` = SET TO NOTHING. The organization decided this
 *     step asks nothing — including a legacy report step.
 */
import { getStatusCapabilities } from '../types/task-flow';

// ─────────────────────────────────────────────────────────────── types ──

/** Exactly these eight. A new one is a product decision, not a string. */
export const STEP_FORM_FIELD_TYPES = ['note', 'choice', 'photos', 'signature', 'name', 'number', 'yesno', 'date'] as const;
export type StepFormFieldType = (typeof STEP_FORM_FIELD_TYPES)[number];

/**
 * A field that also writes to the CRM when the job has a client:
 *   - `outcome`  (choice only) → a note on the client's timeline
 *   - `followUp` (date only)   → a reminder on that date
 */
export const STEP_FORM_CRM_LINKS = ['outcome', 'followUp'] as const;
export type StepFormCrmLink = (typeof STEP_FORM_CRM_LINKS)[number];

export interface StepFormField {
  /** Stable across edits — answers are keyed by it. Generated when absent. */
  id: string;
  type: StepFormFieldType;
  /** The organization's own words once saved. */
  label: string;
  required: boolean;
  /** `choice` only. */
  options?: string[];
  /** `choice` → 'outcome', `date` → 'followUp'. */
  crm?: StepFormCrmLink;
}

export interface StepForm {
  /** Bumped by the SERVER whenever the fields change. Never taken from a client. */
  version: number;
  fields: StepFormField[];
}

/**
 * One answer, by field type:
 *   note / name / choice / signature / date → string (signature = an attachment id, date = yyyy-mm-dd)
 *   photos → string[] (attachment ids)
 *   number → number
 *   yesno  → boolean
 */
export type StepFormAnswerValue = string | string[] | number | boolean;
export type StepFormAnswers = Record<string, StepFormAnswerValue>;

// ────────────────────────────────────────────────────────────── limits ──

/**
 * Not tuning — a definition and its answers are JSON, and JSON with no ceiling
 * is a way to make one tap cost a row the size of a book.
 */
export const STEP_FORM_LIMITS = {
  maxFields: 20,
  maxLabelLength: 80,
  maxOptions: 12,
  maxOptionLength: 60,
  maxNoteLength: 2000,
  maxNameLength: 120,
  maxPhotos: 10,
  /** A number answer is finite and within ±maxNumber. */
  maxNumber: 1e9,
  maxFieldIdLength: 40,
  /** An attachment id (cuid or a phone-made uuid). */
  maxFileIdLength: 128,
} as const;

const FIELD_ID = /^[A-Za-z0-9_-]{1,40}$/;
const FILE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Control characters other than tab / newline — never meaningful in an answer. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const FIELD_KEYS = new Set(['id', 'type', 'label', 'required', 'options', 'crm']);

export function isStepFormFieldType(v: unknown): v is StepFormFieldType {
  return typeof v === 'string' && (STEP_FORM_FIELD_TYPES as readonly string[]).includes(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function cleanText(v: string): string {
  return v.replace(CONTROL, '').trim();
}

/** A new field id. Not a secret — only has to be unique within one form. */
export function newStepFormFieldId(taken: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const id = `f_${Math.random().toString(36).slice(2, 10)}`;
    if (id.length > 4 && !taken.has(id)) return id;
  }
}

// ────────────────────────────────────────────────── the definition ──

export type StepFormDefinitionErrorCode =
  | 'not_object'
  | 'unknown_key'
  | 'too_many_fields'
  | 'unknown_type'
  | 'invalid_id'
  | 'duplicate_id'
  | 'label_required'
  | 'label_too_long'
  | 'options_required'
  | 'too_many_options'
  | 'option_too_long'
  | 'duplicate_option'
  | 'options_not_allowed'
  | 'crm_invalid'
  | 'crm_not_allowed'
  | 'crm_duplicate';

export interface StepFormDefinitionError {
  /** Position in `fields`; absent for a problem with the form as a whole. */
  index?: number;
  fieldId?: string;
  code: StepFormDefinitionErrorCode;
}

export type StepFormDefinitionResult =
  | { ok: true; form: { fields: StepFormField[] } }
  | { ok: false; errors: StepFormDefinitionError[] };

/**
 * Judge a definition from the builder (or a stored/template one) and return it
 * normalised: trimmed labels and options, `required` a boolean, a generated id
 * for a field that has none, and nothing the platform does not recognise.
 *
 * Accepts `{ fields: [...] }` or a bare array. A `version` on the input is
 * ignored — the server decides versions (`nextStepForm`).
 *
 * STRICT: an unknown property, an unknown type or an option on a non-choice is
 * an ERROR, not something silently dropped — the person building the form must
 * not believe they saved something the server threw away.
 */
export function validateStepFormDefinition(input: unknown): StepFormDefinitionResult {
  const rawFields = Array.isArray(input) ? input : isPlainObject(input) ? input.fields : undefined;
  if (!Array.isArray(rawFields)) return { ok: false, errors: [{ code: 'not_object' }] };
  if (isPlainObject(input)) {
    for (const k of Object.keys(input)) {
      if (k !== 'fields' && k !== 'version') return { ok: false, errors: [{ code: 'unknown_key' }] };
    }
  }
  if (rawFields.length > STEP_FORM_LIMITS.maxFields) return { ok: false, errors: [{ code: 'too_many_fields' }] };

  const errors: StepFormDefinitionError[] = [];
  const fields: StepFormField[] = [];
  const ids = new Set<string>();
  // Ids given explicitly are reserved first, so a generated one can never take one.
  for (const raw of rawFields) {
    if (isPlainObject(raw) && typeof raw.id === 'string') ids.add(raw.id.trim());
  }
  const seen = new Set<string>();
  const crmUsed = new Set<string>();

  rawFields.forEach((raw, index) => {
    if (!isPlainObject(raw)) {
      errors.push({ index, code: 'not_object' });
      return;
    }
    const push = (code: StepFormDefinitionErrorCode, fieldId?: string) => errors.push({ index, ...(fieldId ? { fieldId } : {}), code });

    let id: string;
    if (raw.id === undefined || raw.id === null || raw.id === '') {
      id = newStepFormFieldId(ids);
      ids.add(id);
    } else if (typeof raw.id === 'string' && FIELD_ID.test(raw.id.trim())) {
      id = raw.id.trim();
    } else {
      push('invalid_id');
      return;
    }
    if (seen.has(id)) push('duplicate_id', id);
    seen.add(id);

    for (const k of Object.keys(raw)) if (!FIELD_KEYS.has(k)) push('unknown_key', id);

    if (!isStepFormFieldType(raw.type)) {
      push('unknown_type', id);
      return;
    }
    const type = raw.type;

    const label = typeof raw.label === 'string' ? cleanText(raw.label) : '';
    if (!label) push('label_required', id);
    else if (label.length > STEP_FORM_LIMITS.maxLabelLength) push('label_too_long', id);

    const field: StepFormField = { id, type, label, required: raw.required === true };

    const hasOptions = raw.options !== undefined && raw.options !== null;
    if (type === 'choice') {
      if (!Array.isArray(raw.options)) {
        push('options_required', id);
      } else {
        const options: string[] = [];
        for (const o of raw.options) {
          const text = typeof o === 'string' ? cleanText(o) : '';
          if (!text) continue;
          if (text.length > STEP_FORM_LIMITS.maxOptionLength) push('option_too_long', id);
          else if (options.includes(text)) push('duplicate_option', id);
          else options.push(text);
        }
        // One option is not a choice.
        if (options.length < 2) push('options_required', id);
        else if (options.length > STEP_FORM_LIMITS.maxOptions) push('too_many_options', id);
        field.options = options;
      }
    } else if (hasOptions) {
      push('options_not_allowed', id);
    }

    if (raw.crm !== undefined && raw.crm !== null) {
      if (!(STEP_FORM_CRM_LINKS as readonly string[]).includes(raw.crm as string)) {
        push('crm_invalid', id);
      } else {
        const crm = raw.crm as StepFormCrmLink;
        const fits = (crm === 'outcome' && type === 'choice') || (crm === 'followUp' && type === 'date');
        if (!fits) push('crm_not_allowed', id);
        // One outcome and one follow-up per step — two would be two answers to one question.
        else if (crmUsed.has(crm)) push('crm_duplicate', id);
        else {
          crmUsed.add(crm);
          field.crm = crm;
        }
      }
    }

    fields.push(field);
  });

  return errors.length ? { ok: false, errors } : { ok: true, form: { fields } };
}

/** Same fields, same order, same everything — what decides whether a save is a new version. */
export function sameStepFormFields(a: readonly StepFormField[], b: readonly StepFormField[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((f, i) => {
    const g = b[i]!;
    return (
      f.id === g.id && f.type === g.type && f.label === g.label && f.required === g.required &&
      (f.crm ?? null) === (g.crm ?? null) &&
      JSON.stringify(f.options ?? null) === JSON.stringify(g.options ?? null)
    );
  });
}

/**
 * The stored form after a save: the version stays when nothing changed and
 * goes up by one when anything did. `previous` is whatever the step held (may
 * be null or malformed JSON — then this is version 1).
 */
export function nextStepForm(previous: unknown, fields: StepFormField[]): StepForm {
  const prev = parseStoredStepForm(previous);
  if (!prev) return { version: 1, fields };
  return sameStepFormFields(prev.fields, fields) ? prev : { version: prev.version + 1, fields };
}

/** A stored form (DB JSON / a snapshot) read back; null if absent or not a valid definition. */
export function parseStoredStepForm(stored: unknown): StepForm | null {
  if (!isPlainObject(stored)) return null;
  const res = validateStepFormDefinition({ fields: stored.fields });
  if (!res.ok) return null;
  const v = Number(stored.version);
  return { version: Number.isInteger(v) && v > 0 ? v : 1, fields: res.form.fields };
}

// ─────────────────────────────────────────────────────── the answers ──

export type StepAnswerErrorCode =
  | 'not_object'
  | 'unknown_field'
  | 'required'
  | 'wrong_type'
  | 'too_long'
  | 'too_many'
  | 'not_an_option'
  | 'out_of_range'
  | 'invalid_date'
  | 'invalid_file';

export interface StepAnswerError {
  /** The field's id; `*` for a problem with the answers as a whole. */
  fieldId: string;
  code: StepAnswerErrorCode;
}

export type StepAnswersResult =
  | { ok: true; clean: StepFormAnswers }
  | { ok: false; errors: StepAnswerError[] };

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && cleanText(v) === '') || (Array.isArray(v) && v.length === 0);
}

function isRealDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/**
 * Judge a set of answers against a form. Pure — the phone runs it before
 * sending, the server runs it again and trusts only its own result.
 *
 *  - every key must be a field of the form (unknown keys are refused)
 *  - a required field must be present and non-empty (`false` IS an answer to yes/no)
 *  - every value must be of its field's type, within its limits
 *  - a choice must be one of the field's options
 *  - photos and signatures must LOOK like attachment ids — whether they belong
 *    to this job is the server's check (`stepFormFileIds`)
 *
 * `clean` holds only the fields that were answered, text trimmed, photo ids
 * de-duplicated in order.
 */
export function validateStepAnswers(form: Pick<StepForm, 'fields'>, answers: unknown): StepAnswersResult {
  const input = answers === undefined || answers === null ? {} : answers;
  if (!isPlainObject(input)) return { ok: false, errors: [{ fieldId: '*', code: 'not_object' }] };

  const errors: StepAnswerError[] = [];
  const byId = new Map(form.fields.map((f) => [f.id, f]));
  for (const key of Object.keys(input)) {
    if (!byId.has(key)) errors.push({ fieldId: key.slice(0, STEP_FORM_LIMITS.maxFieldIdLength), code: 'unknown_field' });
  }

  const clean: StepFormAnswers = {};
  for (const field of form.fields) {
    const raw = Object.prototype.hasOwnProperty.call(input, field.id) ? input[field.id] : undefined;
    const fail = (code: StepAnswerErrorCode) => errors.push({ fieldId: field.id, code });

    if (isEmpty(raw)) {
      if (field.required) fail('required');
      continue;
    }

    switch (field.type) {
      case 'note':
      case 'name': {
        if (typeof raw !== 'string') { fail('wrong_type'); break; }
        const text = cleanText(raw);
        const max = field.type === 'note' ? STEP_FORM_LIMITS.maxNoteLength : STEP_FORM_LIMITS.maxNameLength;
        if (text.length > max) { fail('too_long'); break; }
        clean[field.id] = text;
        break;
      }
      case 'choice': {
        if (typeof raw !== 'string') { fail('wrong_type'); break; }
        const text = cleanText(raw);
        if (!(field.options ?? []).includes(text)) { fail('not_an_option'); break; }
        clean[field.id] = text;
        break;
      }
      case 'photos': {
        if (!Array.isArray(raw)) { fail('wrong_type'); break; }
        if (!raw.every((x) => typeof x === 'string' && FILE_ID.test(x))) { fail('invalid_file'); break; }
        const ids = [...new Set(raw as string[])];
        if (ids.length > STEP_FORM_LIMITS.maxPhotos) { fail('too_many'); break; }
        clean[field.id] = ids;
        break;
      }
      case 'signature': {
        if (typeof raw !== 'string') { fail('wrong_type'); break; }
        if (!FILE_ID.test(raw)) { fail('invalid_file'); break; }
        clean[field.id] = raw;
        break;
      }
      case 'number': {
        if (typeof raw !== 'number' || !Number.isFinite(raw)) { fail('wrong_type'); break; }
        if (Math.abs(raw) > STEP_FORM_LIMITS.maxNumber) { fail('out_of_range'); break; }
        clean[field.id] = raw;
        break;
      }
      case 'yesno': {
        if (typeof raw !== 'boolean') { fail('wrong_type'); break; }
        clean[field.id] = raw;
        break;
      }
      case 'date': {
        if (typeof raw !== 'string') { fail('wrong_type'); break; }
        const text = raw.trim();
        if (!isRealDate(text)) { fail('invalid_date'); break; }
        clean[field.id] = text;
        break;
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, clean };
}

/** Every attachment id the answers name (photos + signatures), for the server's ownership check. */
export function stepFormFileIds(form: Pick<StepForm, 'fields'>, clean: StepFormAnswers): string[] {
  const out = new Set<string>();
  for (const f of form.fields) {
    const v = clean[f.id];
    if (f.type === 'photos' && Array.isArray(v)) v.forEach((id) => out.add(id));
    if (f.type === 'signature' && typeof v === 'string') out.add(v);
  }
  return [...out];
}

/** What the answers say to the CRM: the outcome chosen, and the follow-up date. */
export function stepFormCrmAnswers(
  form: Pick<StepForm, 'fields'>,
  clean: StepFormAnswers,
): { outcome?: { label: string; value: string }; followUp?: { label: string; date: string } } {
  const out: { outcome?: { label: string; value: string }; followUp?: { label: string; date: string } } = {};
  for (const f of form.fields) {
    const v = clean[f.id];
    if (f.crm === 'outcome' && f.type === 'choice' && typeof v === 'string') out.outcome = { label: f.label, value: v };
    if (f.crm === 'followUp' && f.type === 'date' && typeof v === 'string') out.followUp = { label: f.label, date: v };
  }
  return out;
}

// ─────────────────────────────────────────────────────────── presets ──

/**
 * Starting points in the builder. Labels are ENGLISH defaults: the builder
 * shows a preset's NAME translated (`stepForm.preset.<id>`), and once saved the
 * field labels are the organization's own text.
 *
 * ⚠️ `fieldService` is also what a legacy report step asks (see
 * `effectiveStepForm`) — its field ids are therefore a contract the phone's
 * finish sheet answers against. Do not rename them.
 */
export type StepFormPresetId = 'fieldService' | 'salesVisit' | 'delivery' | 'inspection' | 'support';

export const STEP_FORM_PRESETS: Readonly<Record<StepFormPresetId, StepForm>> = {
  fieldService: {
    version: 1,
    fields: [
      { id: 'work_done', type: 'note', label: 'What you did', required: true },
      { id: 'photos_before', type: 'photos', label: 'Before', required: true },
      { id: 'photos_after', type: 'photos', label: 'After', required: true },
      { id: 'tech_signature', type: 'signature', label: 'Your signature', required: true },
      { id: 'customer_name', type: 'name', label: 'Customer name', required: true },
      { id: 'customer_signature', type: 'signature', label: 'Customer signature', required: true },
    ],
  },
  salesVisit: {
    version: 1,
    fields: [
      { id: 'outcome', type: 'choice', label: 'Outcome', required: true, options: ['Won', 'Follow-up', 'No interest', 'Not reached'], crm: 'outcome' },
      { id: 'notes', type: 'note', label: 'Notes', required: false },
      { id: 'follow_up_on', type: 'date', label: 'Follow up on', required: false, crm: 'followUp' },
    ],
  },
  delivery: {
    version: 1,
    fields: [
      { id: 'proof_of_delivery', type: 'photos', label: 'Proof of delivery', required: true },
      { id: 'received_by', type: 'name', label: 'Received by', required: true },
      { id: 'recipient_signature', type: 'signature', label: 'Recipient signature', required: false },
    ],
  },
  inspection: {
    version: 1,
    fields: [
      { id: 'passed', type: 'yesno', label: 'Passed', required: true },
      { id: 'findings', type: 'note', label: 'Findings', required: true },
      { id: 'evidence', type: 'photos', label: 'Evidence', required: false },
      { id: 'inspector_signature', type: 'signature', label: 'Inspector signature', required: true },
    ],
  },
  support: {
    version: 1,
    fields: [
      { id: 'resolution', type: 'choice', label: 'Resolution', required: true, options: ['Resolved', 'Workaround', 'Escalated', 'Not reproducible'] },
      { id: 'what_you_did', type: 'note', label: 'What you did', required: true },
    ],
  },
};
export const STEP_FORM_PRESET_IDS = Object.keys(STEP_FORM_PRESETS) as StepFormPresetId[];

/** A preset as a mutable form (a fresh copy every call — callers edit it). */
export function stepFormPreset(id: StepFormPresetId): StepForm {
  return JSON.parse(JSON.stringify(STEP_FORM_PRESETS[id])) as StepForm;
}

// ───────────────────────────────────────────── which form a step asks ──

/** The parts of a step (a WorkflowStatus row or a FlowStatus) this needs. */
export interface StepFormStep {
  key: string;
  isFinal?: boolean | null;
  /** The step's own capabilities; undefined/null = say nothing (the shipped preset decides). */
  capabilities?: readonly string[] | null;
  /** The stored definition; null/undefined = not set. */
  form?: unknown;
}

export type StepFormSource = 'own' | 'legacy';

/**
 * Which form moving INTO this step asks, and why:
 *  - `own`    — the step's own definition (an empty one asks nothing → null)
 *  - `legacy` — the step has none, but it is a final step with the `report`
 *               capability: the field-service report it always asked, now as
 *               the `fieldService` preset. The same test the phone's
 *               `needsReport` makes — own capabilities first, preset when the
 *               step says nothing.
 */
export function resolveStepForm(
  step: StepFormStep | null | undefined,
  workflowName?: string | null,
): { form: StepForm | null; source: StepFormSource | null } {
  if (!step) return { form: null, source: null };
  if (step.form !== undefined && step.form !== null) {
    const own = parseStoredStepForm(step.form);
    if (own) return own.fields.length ? { form: own, source: 'own' } : { form: null, source: null };
    // A corrupt stored form falls back to the legacy rule below rather than asking nothing.
  }
  const final = step.key === 'COMPLETED' || !!step.isFinal;
  const caps = step.capabilities ?? getStatusCapabilities(workflowName, step.key);
  if (final && caps.includes('report')) return { form: stepFormPreset('fieldService'), source: 'legacy' };
  return { form: null, source: null };
}

/** The form moving INTO this step asks, or null when it asks nothing. */
export function effectiveStepForm(step: StepFormStep | null | undefined, workflowName?: string | null): StepForm | null {
  return resolveStepForm(step, workflowName).form;
}

// ──────────────────────────────────────────────────── refusal codes ──

/**
 * The coded refusals a status change can answer with, same pattern as the
 * distance refusals: `{ code, message, params }`, surviving the gateway's
 * exception filter, BullMQ and a sync push.
 *
 *  - STEP_FORM_INVALID       (400) params: { statusKey, errors: StepAnswerError[] }
 *  - STEP_FORM_FOREIGN_FILE  (400) params: { statusKey, fileIds: string[] } — a photo or
 *    signature id that is not an attachment of THIS job
 */
export const STEP_FORM_REFUSAL = {
  INVALID: 'STEP_FORM_INVALID',
  FOREIGN_FILE: 'STEP_FORM_FOREIGN_FILE',
} as const;

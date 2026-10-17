/** What a step form is: its field types, its limits, and the small text rules both checks share. */

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

export { FIELD_ID, FILE_ID, ISO_DATE, FIELD_KEYS, isPlainObject, cleanText };

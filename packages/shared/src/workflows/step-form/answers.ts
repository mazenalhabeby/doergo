/** Judging the answers a member sent, and what they carry on (files, CRM). */
import {
  FILE_ID,
  ISO_DATE,
  STEP_FORM_LIMITS,
  cleanText,
  isPlainObject,
  type StepForm,
  type StepFormAnswers,
} from './types';

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

/** Labels, counts, days and an answer as it is shown (moved here unchanged) */
import { STEP_FORM_PRESETS, localDateKey, type StepForm, type StepFormField } from '@hbcfield/shared/client';

/* ---------------- labels ---------------- */

/**
 * The field-service preset's fixed ids, translated — ONLY while the label is
 * still the preset's English default. A legacy report step arrives with these
 * English labels from the server; a member reading German read German labels
 * on the old Finish sheet and must keep doing so. Any label the organization
 * wrote is shown exactly as written.
 */
const PRESET_LABEL_KEYS: Readonly<Record<string, string>> = {
  work_done: 'job.finish.stepDid',
  photos_before: 'job.finish.before',
  photos_after: 'job.finish.after',
  tech_signature: 'job.finish.yourSignature',
  customer_name: 'job.finish.customerName',
  customer_signature: 'job.finish.customerSignature',
};

export function fieldLabel(field: Pick<StepFormField, 'id' | 'label'>, t: (key: string) => string): string {
  const key = PRESET_LABEL_KEYS[field.id];
  if (!key) return field.label;
  const preset = STEP_FORM_PRESETS.fieldService.fields.find((f) => f.id === field.id);
  return preset && preset.label === field.label ? t(key) : field.label;
}

/** "2 required · 4 fields" — the counts the sheet's caption says. */
export function formCounts(form: Pick<StepForm, 'fields'>): { required: number; total: number } {
  return { required: form.fields.filter((f) => f.required).length, total: form.fields.length };
}

/* ---------------- dates ---------------- */


/** A local day as `yyyy-mm-dd` — the shape a date answer is stored in. */
export function isoDay(d: Date): string {
  return localDateKey(d);
}

/** `yyyy-mm-dd` back to a local day; null when it is not one. */
export function dayOf(iso: string | undefined | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

/** What one answer reads as, for the report view. Files are resolved by the view from `files`. */
type ShownAnswer =
  | { kind: 'text'; text: string }
  | { kind: 'yesno'; value: boolean }
  | { kind: 'photos'; ids: string[] }
  | { kind: 'signature'; id: string };

export function shownAnswer(field: Pick<StepFormField, 'type'>, value: unknown): ShownAnswer | null {
  if (value === undefined || value === null || value === '') return null;
  switch (field.type) {
    case 'yesno': return typeof value === 'boolean' ? { kind: 'yesno', value } : null;
    case 'photos':
      return Array.isArray(value) && value.length
        ? { kind: 'photos', ids: value.filter((x): x is string => typeof x === 'string') }
        : null;
    case 'signature': return typeof value === 'string' ? { kind: 'signature', id: value } : null;
    case 'number': return typeof value === 'number' ? { kind: 'text', text: String(value) } : null;
    default: return typeof value === 'string' ? { kind: 'text', text: value } : null;
  }
}

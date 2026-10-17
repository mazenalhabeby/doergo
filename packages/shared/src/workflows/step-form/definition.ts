/** Judging a form the office built — refused, never repaired. */
import {
  FIELD_ID,
  FIELD_KEYS,
  STEP_FORM_CRM_LINKS,
  STEP_FORM_LIMITS,
  cleanText,
  isPlainObject,
  isStepFormFieldType,
  newStepFormFieldId,
  type StepForm,
  type StepFormCrmLink,
  type StepFormField,
} from './types';

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

/** Ready-made forms, which form a step asks, and the refusal codes. */
import { getStatusCapabilities } from '../../types/task-flow';
import { parseStoredStepForm } from './definition';
import type { StepForm } from './types';

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
      {
        id: 'outcome',
        type: 'choice',
        label: 'Outcome',
        required: true,
        options: ['Won', 'Follow-up', 'No interest', 'Not reached'],
        crm: 'outcome',
      },
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
      {
        id: 'resolution',
        type: 'choice',
        label: 'Resolution',
        required: true,
        options: ['Resolved', 'Workaround', 'Escalated', 'Not reproducible'],
      },
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
export function effectiveStepForm(
  step: StepFormStep | null | undefined,
  workflowName?: string | null,
): StepForm | null {
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

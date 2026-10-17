/** Which form a move asks, its pages, and the draft as it is filled in (moved here unchanged) */
import {
  resolveStepForm,
  type FlowStatus,
  type StepAnswerError,
  type StepForm,
  type StepFormField,
  type StepFormFieldType,
  type StepFormSource,
  validateStepAnswers,
} from '@hbcfield/shared/client';

const BLOCKED = 'BLOCKED';

/* ---------------- which form a move asks ---------------- */

/** The workflow as the task carries it — `task.workflow`, statuses with their stored `form`. */
export interface WorkflowWithForms {
  name?: string | null;
  statuses?: ReadonlyArray<Record<string, unknown>> | null;
}

/**
 * The form moving a job INTO `to` asks, and why (`own` / `legacy`).
 *
 * The step's own stored definition comes from the workflow's raw status row
 * (`FlowStatus` does not carry it); its capabilities and finality from the
 * row first, then the flow the page reads — the same order `needsReport`
 * always used, so the legacy field-service report is asked exactly where the
 * old Finish sheet was.
 */
export function formForMove(
  workflow: WorkflowWithForms | null | undefined,
  steps: readonly FlowStatus[],
  to: string,
  workflowName?: string | null,
): { form: StepForm | null; source: StepFormSource | null } {
  const row = workflow?.statuses?.find((s) => s.key === to) as
    | { isFinal?: boolean | null; capabilities?: string[] | null; form?: unknown }
    | undefined;
  const flow = steps.find((s) => s.key === to);
  return resolveStepForm(
    {
      key: to,
      isFinal: row?.isFinal ?? flow?.isFinal ?? null,
      capabilities: row?.capabilities ?? flow?.capabilities ?? null,
      form: row?.form ?? null,
    },
    workflowName ?? workflow?.name ?? null,
  );
}

type MoveKind = 'direct' | 'form' | 'issue';

/**
 * What taking a job to `to` opens:
 *  - Blocked → the Report-an-issue sheet, UNLESS the Blocked step has a form
 *    of its own (then the organization decided what to ask)
 *  - any step whose form asks something → the step form
 *  - anything else → the move, at once
 */
export function moveKind(to: string, resolved: { form: StepForm | null; source: StepFormSource | null }): MoveKind {
  if (to === BLOCKED) return resolved.form && resolved.source === 'own' ? 'form' : 'issue';
  return resolved.form ? 'form' : 'direct';
}

/** Does any step of this workflow ask something? Then the job may have reports to show. */
export function workflowAsks(
  workflow: WorkflowWithForms | null | undefined,
  steps: readonly FlowStatus[],
  workflowName?: string | null,
): boolean {
  return steps.some((s) => !!formForMove(workflow, steps, s.key, workflowName).form);
}

/* ---------------- pages ---------------- */

type FormGroup = 'answers' | 'photos' | 'signoff';

/** Words and choices first, then the camera, then the hand-over — the old Finish sheet's order. */
export function groupOf(type: StepFormFieldType): FormGroup {
  if (type === 'photos') return 'photos';
  if (type === 'signature' || type === 'name') return 'signoff';
  return 'answers';
}

/** Up to this many fields (and at most one signature pad) fit on one screen. */
export const SINGLE_SCREEN_FIELDS = 4;

/**
 * The form split into pages.
 *
 * A short form is ONE screen: a choice and a note, a delivery's photo + name
 * + signature. A longer one — or one with two signature pads, which do not
 * fit one screen and are handed to two people — goes in up to three pages by
 * group (answers → photos → sign-off), each keeping the form's own order. An
 * empty group is no page.
 */
export function paginateForm(form: Pick<StepForm, 'fields'>): StepFormField[][] {
  const fields = form.fields;
  if (fields.length === 0) return [];
  const pads = fields.filter((f) => f.type === 'signature').length;
  if (fields.length <= SINGLE_SCREEN_FIELDS && pads <= 1) return [fields.slice()];
  const order: FormGroup[] = ['answers', 'photos', 'signoff'];
  return order.map((g) => fields.filter((f) => groupOf(f.type) === g)).filter((p) => p.length > 0);
}

/* ---------------- the draft ---------------- */

/** A photo picked on the phone — the same shape as `PickedImage`. */
export interface DraftPhoto {
  uri: string;
  fileName: string;
  mimeType: string;
  width?: number;
  height?: number;
  fileSize?: number;
}

/**
 * What the member has put in so far, by field id:
 *  note / name / choice / number (as typed) / date (yyyy-mm-dd) → string
 *  yesno → boolean · photos → DraftPhoto[] · signature → boolean (ink on the pad)
 */
export type FormDraft = Record<string, string | boolean | DraftPhoto[] | undefined>;

/** A fresh draft: a yes/no is a switch, so it always holds an answer — "no". */
export function emptyDraft(form: Pick<StepForm, 'fields'>): FormDraft {
  const d: FormDraft = {};
  for (const f of form.fields) {
    if (f.type === 'yesno') d[f.id] = false;
    else if (f.type === 'photos') d[f.id] = [];
    else if (f.type === 'signature') d[f.id] = false;
    else d[f.id] = '';
  }
  return d;
}

/** "12,5" and "12.5" both read as twelve and a half; anything else stays text, and is refused as `wrong_type`. */
export function parseNumber(text: string): number | string {
  const s = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return text.trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : text.trim();
}

/** A stand-in id for a file not yet uploaded — the SHAPE of an attachment id, so the shared check judges the rest. */
const PENDING_FILE = (fieldId: string, i: number) => `pending-${fieldId}-${i}`.slice(0, 128);

/**
 * The draft as answers, for judging before anything is uploaded: photos and
 * an inked pad stand in as placeholder ids. `files` replaces them with the
 * real attachment ids once they are queued.
 */
export function draftAnswers(form: Pick<StepForm, 'fields'>, draft: FormDraft, files?: Record<string, string[]>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of form.fields) {
    const v = draft[f.id];
    switch (f.type) {
      case 'note':
      case 'name':
      case 'choice':
      case 'date':
        if (typeof v === 'string' && v.trim()) out[f.id] = v;
        break;
      case 'number':
        if (typeof v === 'string' && v.trim()) out[f.id] = parseNumber(v);
        break;
      case 'yesno':
        out[f.id] = v === true;
        break;
      case 'photos': {
        const ids = files?.[f.id] ?? (Array.isArray(v) ? v.map((_, i) => PENDING_FILE(f.id, i)) : []);
        if (ids.length) out[f.id] = ids;
        break;
      }
      case 'signature': {
        const id = files?.[f.id]?.[0] ?? (v === true ? PENDING_FILE(f.id, 0) : undefined);
        if (id) out[f.id] = id;
        break;
      }
    }
  }
  return out;
}

/** The errors of a refused judgement (written out: the specs compile without strict narrowing). */
function errorsOf(res: ReturnType<typeof validateStepAnswers>): StepAnswerError[] {
  return res.ok ? [] : (res as { errors: StepAnswerError[] }).errors;
}

/** The field errors a page's draft has right now — only for the fields on that page (all fields when none given). */
export function draftErrors(form: Pick<StepForm, 'fields'>, draft: FormDraft, onPage?: readonly StepFormField[]): Record<string, string> {
  const res = validateStepAnswers(form, draftAnswers(form, draft));
  if (res.ok) return {};
  const ids = onPage ? new Set(onPage.map((f) => f.id)) : null;
  const out: Record<string, string> = {};
  for (const e of errorsOf(res)) if (!ids || ids.has(e.fieldId)) out[e.fieldId] ??= e.code;
  return out;
}

/** Can the member leave this page (or send, on the last one)? */
export function pageComplete(form: Pick<StepForm, 'fields'>, draft: FormDraft, page: readonly StepFormField[]): boolean {
  return Object.keys(draftErrors(form, draft, page)).length === 0;
}

/** The labels of the required fields on this page still empty — for "Still needed: …". */
export function stillNeeded(form: Pick<StepForm, 'fields'>, draft: FormDraft, page: readonly StepFormField[]): StepFormField[] {
  const errors = draftErrors(form, draft, page);
  return page.filter((f) => errors[f.id] === 'required');
}

export { errorsOf };

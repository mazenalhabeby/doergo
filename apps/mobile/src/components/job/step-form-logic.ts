/**
 * Step forms on the phone — "Ask when a job moves here".
 *
 * A workflow step may carry a FORM (`workflows/step-form` in shared). Moving a
 * job INTO that step opens `StepFormSheet`, drawn from the form's fields; the
 * photos and signatures are queued as the job's attachments first, and their
 * attachment ids are the answers the status change carries.
 *
 * ⚠️ PURE AND REACT-NATIVE-FREE: which form a move asks, how a form is split
 * into pages, what the draft answers are and how a refusal maps back onto the
 * fields are all decided here and tested (`step-form-*.spec.ts`). The sheet
 * only draws what these return.
 *
 * ⚠️ ONE RULE FOR PHONE AND SERVER. Whether a move asks (`resolveStepForm`)
 * and whether the answers are acceptable (`validateStepAnswers`) are the
 * shared functions the server runs again — the phone never invents a rule.
 */
import {
  resolveStepForm, validateStepAnswers, STEP_FORM_PRESETS, STEP_FORM_REFUSAL,
  type FlowStatus, type StepAnswerError, type StepForm, type StepFormField, type StepFormFieldType, type StepFormAnswers, type StepFormSource,
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
export function workflowAsks(workflow: WorkflowWithForms | null | undefined, steps: readonly FlowStatus[], workflowName?: string | null): boolean {
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

/* ---------------- sending ---------------- */

interface FileToSend {
  fieldId: string;
  kind: 'photo' | 'signature';
  /** A photo's picked image; for a signature, the pad's PNG data URL is supplied at send time. */
  photo?: DraftPhoto;
}

/**
 * The files a form sends, in field order: each photo, then each inked pad.
 * Queued (or uploaded) BEFORE the status change, in the same lane.
 */
export function filesToSend(form: Pick<StepForm, 'fields'>, draft: FormDraft): FileToSend[] {
  const out: FileToSend[] = [];
  for (const f of form.fields) {
    const v = draft[f.id];
    if (f.type === 'photos' && Array.isArray(v)) for (const p of v) out.push({ fieldId: f.id, kind: 'photo', photo: p });
    if (f.type === 'signature' && v === true) out.push({ fieldId: f.id, kind: 'signature' });
  }
  return out;
}

/** The answers the status change carries, with the real attachment ids — judged once more, cleaned. */
export function finalAnswers(
  form: Pick<StepForm, 'fields'>,
  draft: FormDraft,
  files: Record<string, string[]>,
): { ok: true; answers: StepFormAnswers } | { ok: false; errors: Record<string, string> } {
  const res = validateStepAnswers(form, draftAnswers(form, draft, files));
  if (res.ok) return { ok: true, answers: res.clean };
  const errors: Record<string, string> = {};
  for (const e of errorsOf(res)) errors[e.fieldId] ??= e.code;
  return { ok: false, errors };
}

/** One file put onto the job: its attachment id, the unsent operation to wait for, and how it went. */
export interface SentFile {
  id: string | null;
  waitFor: string | null;
  outcome: { kind: 'done' | 'queued' | 'refused'; code?: string; message?: string };
}

type PreparedStepForm =
  | { ok: true; answers: StepFormAnswers; dependsOn: string[]; queuedFiles: boolean }
  | { ok: false; fieldErrors: Record<string, string>; refused?: { code?: string; message?: string } };

/** A signature as the file it is sent as — the PNG the pad draws. */
export function signatureFile(png: string, now: number = Date.now()): DraftPhoto {
  // ⚠️ `mimeType`, not `fileType`: the upload reads `photo.mimeType`.
  return { uri: png, fileName: `signature_${now}.png`, mimeType: 'image/png', width: 600, height: 200, fileSize: 0 };
}

/**
 * FILES FIRST: every photo and each inked signature goes onto the job as an
 * attachment (`send`, queued in the job's lane where a queue exists); their
 * ids become the answers, judged once more with the shared rule.
 *
 * `sent` remembers what already went, by picture, so sending the form again
 * after a refusal does not put the same photos on the job twice.
 *
 * Returns the answers and the still-unsent operations the move must wait for
 * — the status change is the caller's, through the one status write.
 */
export async function prepareStepForm(args: {
  form: Pick<StepForm, 'fields'>;
  draft: FormDraft;
  signatures: Record<string, string>;
  sent: Map<string, { id: string; waitFor: string | null }>;
  send: (file: DraftPhoto) => Promise<SentFile>;
}): Promise<PreparedStepForm> {
  const files: Record<string, string[]> = {};
  const dependsOn: string[] = [];
  let queuedFiles = false;
  for (const f of filesToSend(args.form, args.draft)) {
    const png = f.kind === 'signature' ? args.signatures[f.fieldId] : undefined;
    const src = f.kind === 'photo' ? f.photo ?? null : png ? signatureFile(png) : null;
    if (!src) return { ok: false, fieldErrors: { [f.fieldId]: 'required' } };
    let done = args.sent.get(src.uri);
    if (!done) {
      const res = await args.send(src);
      if (res.outcome.kind === 'refused' || !res.id) {
        return {
          ok: false,
          fieldErrors: { [f.fieldId]: 'invalid_file' },
          refused: { code: res.outcome.code, message: res.outcome.message },
        };
      }
      if (res.outcome.kind === 'queued') queuedFiles = true;
      done = { id: res.id, waitFor: res.waitFor };
      args.sent.set(src.uri, done);
    }
    (files[f.fieldId] ??= []).push(done.id);
    if (done.waitFor && !dependsOn.includes(done.waitFor)) dependsOn.push(done.waitFor);
  }
  const final = finalAnswers(args.form, args.draft, files);
  if (final.ok === false) return { ok: false, fieldErrors: (final as { errors: Record<string, string> }).errors };
  return { ok: true, answers: final.answers, dependsOn, queuedFiles };
}

/**
 * The reason a move to Blocked carries when the Blocked step asks its own
 * form: the first note (or choice) answered, so the blocked banner and the
 * office still read WHY.
 */
export function reasonFromAnswers(form: Pick<StepForm, 'fields'>, answers: StepFormAnswers): string | undefined {
  const pick = (t: StepFormFieldType) => form.fields.find((f) => f.type === t && typeof answers[f.id] === 'string' && String(answers[f.id]).trim());
  const f = pick('note') ?? pick('choice');
  return f ? String(answers[f.id]).slice(0, 500) : undefined;
}

/* ---------------- refusals ---------------- */

/**
 * A coded refusal of the move, as field errors to show in the sheet.
 *
 *  - STEP_FORM_INVALID       → `params.errors` by field id and code
 *  - STEP_FORM_FOREIGN_FILE  → the fields whose photo/signature named those ids, as `invalid_file`
 *
 * `*` holds a problem with the answers as a whole. Null for any other refusal.
 */
export function refusalFieldErrors(
  o: { code?: string; params?: Record<string, unknown> },
  sent?: StepFormAnswers,
): Record<string, string> | null {
  if (o.code === STEP_FORM_REFUSAL.INVALID) {
    const list = Array.isArray(o.params?.errors) ? (o.params!.errors as Array<{ fieldId?: unknown; code?: unknown }>) : [];
    const out: Record<string, string> = {};
    for (const e of list) {
      if (typeof e?.fieldId === 'string' && typeof e.code === 'string') out[e.fieldId] ??= e.code;
    }
    return Object.keys(out).length ? out : { '*': 'invalid' };
  }
  if (o.code === STEP_FORM_REFUSAL.FOREIGN_FILE) {
    const ids = new Set(Array.isArray(o.params?.fileIds) ? (o.params!.fileIds as unknown[]).filter((x): x is string => typeof x === 'string') : []);
    const out: Record<string, string> = {};
    for (const [fieldId, v] of Object.entries(sent ?? {})) {
      const values = Array.isArray(v) ? v : [v];
      if (values.some((x) => typeof x === 'string' && ids.has(x))) out[fieldId] = 'invalid_file';
    }
    return Object.keys(out).length ? out : { '*': 'invalid_file' };
  }
  return null;
}

/** The sentence key for an answer error. Unknown codes read as the general one. */
const KNOWN_CODES = new Set([
  'required', 'wrong_type', 'too_long', 'too_many', 'not_an_option', 'out_of_range', 'invalid_date', 'invalid_file', 'unknown_field', 'not_object', 'invalid',
]);
export function errorKey(code: string): string {
  return `job.form.error.${KNOWN_CODES.has(code) ? code : 'invalid'}`;
}

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

const two = (n: number) => String(n).padStart(2, '0');

/** A local day as `yyyy-mm-dd` — the shape a date answer is stored in. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** `yyyy-mm-dd` back to a local day; null when it is not one. */
export function dayOf(iso: string | undefined | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

/* ---------------- reading submissions ---------------- */

export type { StepSubmission } from '../../lib/api/types';

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
    case 'photos': return Array.isArray(value) && value.length ? { kind: 'photos', ids: value.filter((x): x is string => typeof x === 'string') } : null;
    case 'signature': return typeof value === 'string' ? { kind: 'signature', id: value } : null;
    case 'number': return typeof value === 'number' ? { kind: 'text', text: String(value) } : null;
    default: return typeof value === 'string' ? { kind: 'text', text: value } : null;
  }
}

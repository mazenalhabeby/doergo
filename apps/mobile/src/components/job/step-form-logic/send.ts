/** What is sent: files, final answers, the prepared form, and refusals read back (moved here unchanged) */
import {
  STEP_FORM_REFUSAL,
  type StepForm,
  type StepFormAnswers,
  type StepFormFieldType,
  validateStepAnswers,
} from '@hbcfield/shared/client';
import { draftAnswers, errorsOf, type DraftPhoto, type FormDraft } from './draft';

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
  const pick = (t: StepFormFieldType) =>
    form.fields.find((f) => f.type === t && typeof answers[f.id] === 'string' && String(answers[f.id]).trim());
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
    const ids = new Set(
      Array.isArray(o.params?.fileIds)
        ? (o.params!.fileIds as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
    );
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

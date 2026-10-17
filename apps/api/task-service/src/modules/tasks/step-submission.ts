/**
 * The server half of step forms — "Ask when a job moves here".
 *
 * `prepareStepSubmission` decides, BEFORE anything is written, whether the move
 * owes answers and whether the answers given are acceptable: re-validated with
 * the shared `validateStepAnswers` (the phone ran it too, and is not trusted),
 * and every photo / signature id checked to be an attachment of THIS job.
 * `TasksService.updateStatus` then writes the status change and the submission
 * in ONE transaction, so a refused form leaves the job exactly where it was and
 * an accepted one can never exist without its move (or the reverse).
 *
 * Refusals are coded like the distance refusals — `{ code, message, params }` —
 * so they survive BullMQ, the gateway's exception filter and a sync push, and
 * the phone writes them in the member's language.
 */
import { BadRequestException } from '@nestjs/common';
import {
  zoneOf,
  resolveStepForm,
  stepFormCrmAnswers,
  stepFormFileIds,
  validateStepAnswers,
  STEP_FORM_REFUSAL,
  zonedWallTimeToUtc,
  type StepAnswerError,
  type StepForm,
  type StepFormAnswers,
  type StepFormStep,
} from '@hbcfield/shared';

/** What `updateStatus` writes beside the move. */
export interface PreparedStepSubmission {
  statusKey: string;
  form: StepForm;
  answers: StepFormAnswers;
}

interface MinimalPrisma {
  attachment: {
    findMany(args: unknown): Promise<Array<{ id: string; mimeType: string | null; fileType: string }>>;
  };
}

function refuseInvalid(statusKey: string, errors: StepAnswerError[]): never {
  throw new BadRequestException({
    message: 'Some answers this step asks for are missing or not valid.',
    code: STEP_FORM_REFUSAL.INVALID,
    params: { statusKey, errors },
  });
}

/**
 * The step a job is moving into, as `resolveStepForm` needs it: the workflow's
 * own row when there is one, else just the key — a workflow-less job (or one
 * moving to a canonical status its workflow does not define) then falls to the
 * shipped field-service preset, exactly as the phone's `needsReport` does.
 */
function targetStep(workflow: { statuses?: Array<Record<string, unknown>> } | null | undefined, statusKey: string): StepFormStep {
  const row = workflow?.statuses?.find((s) => s.key === statusKey) as StepFormStep | undefined;
  return row ?? { key: statusKey };
}

/**
 * Does this move owe answers, and are the ones given acceptable?
 *
 * Returns what to store, or null when the move asks nothing. Throws the coded
 * refusal otherwise.
 *
 * WHO must answer:
 *  - a step's OWN form — whoever moves the job there, office drag included.
 *    The organization wrote it; that is the rule it chose.
 *  - the LEGACY report (no form set, final step with `report`) — the job's
 *    assigned member, which is who the phone always asked it of. An office
 *    drag to "Completed" never required a report and still does not, so nothing
 *    changes for an existing workflow until somebody edits it. Answers sent
 *    anyway are judged and stored like any other.
 *
 * Answers sent to a step that asks nothing are refused (unknown fields), not
 * silently dropped — a client that believes it recorded a report must hear
 * that it did not.
 */
export async function prepareStepSubmission(
  prisma: MinimalPrisma,
  args: {
    task: { id: string };
    workflow: { name?: string | null; statuses?: Array<Record<string, unknown>> } | null | undefined;
    statusKey: string;
    answers: unknown;
    isAssignedUser: boolean;
  },
): Promise<PreparedStepSubmission | null> {
  const { form, source } = resolveStepForm(targetStep(args.workflow, args.statusKey), args.workflow?.name ?? null);
  const given = args.answers !== undefined && args.answers !== null;

  if (!form) {
    if (!given) return null;
    if (typeof args.answers !== 'object' || Array.isArray(args.answers)) refuseInvalid(args.statusKey, [{ fieldId: '*', code: 'not_object' }]);
    const keys = Object.keys(args.answers as object);
    if (keys.length === 0) return null;
    refuseInvalid(args.statusKey, keys.map((k) => ({ fieldId: k.slice(0, 40), code: 'unknown_field' as const })));
  }

  if (source === 'legacy' && !args.isAssignedUser && !given) return null;

  const judged = validateStepAnswers(form, args.answers);
  if (!judged.ok) refuseInvalid(args.statusKey, judged.errors);
  const clean = judged.clean;

  /*
    Every photo and signature must be an attachment of THIS job. An id from
    another job — or another organization — would put somebody else's photo
    in this job's report, and a signed link to it in front of whoever reads it.
  */
  const ids = stepFormFileIds(form, clean);
  if (ids.length) {
    const rows = await prisma.attachment.findMany({
      where: { id: { in: ids }, taskId: args.task.id },
      select: { id: true, mimeType: true, fileType: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const foreign = ids.filter((id) => !byId.has(id));
    if (foreign.length) {
      throw new BadRequestException({
        message: 'A photo or signature in these answers does not belong to this job.',
        code: STEP_FORM_REFUSAL.FOREIGN_FILE,
        params: { statusKey: args.statusKey, fileIds: foreign },
      });
    }
    // A photo is an image; a signature is the PNG the pad draws.
    const wrongKind: StepAnswerError[] = [];
    for (const f of form.fields) {
      const v = clean[f.id];
      if (f.type === 'photos' && Array.isArray(v) && v.some((id) => byId.get(id)!.fileType !== 'IMAGE')) {
        wrongKind.push({ fieldId: f.id, code: 'invalid_file' });
      }
      if (f.type === 'signature' && typeof v === 'string') {
        const row = byId.get(v)!;
        const png = row.mimeType ? row.mimeType === 'image/png' : row.fileType === 'IMAGE';
        if (!png) wrongKind.push({ fieldId: f.id, code: 'invalid_file' });
      }
    }
    if (wrongKind.length) refuseInvalid(args.statusKey, wrongKind);
  }

  return { statusKey: args.statusKey, form, answers: clean };
}

/** A CRM activity the answers ask for, in the shape `add_customer_activity` takes. */
interface CrmActivityIntent {
  clientId: string;
  type: 'NOTE' | 'REMINDER';
  body: string;
  dueAt?: string;
  reminderKind?: string;
  reminderAssigneeId?: string;
}

/**
 * What the answers say to the client's CRM timeline:
 *  - a choice marked `outcome` → a NOTE ("Outcome: Won", plus the first note answered)
 *  - a date marked `followUp`  → a REMINDER on that date at 09:00 in the job's site zone,
 *    for the member who moved the job
 *
 * Ids derive from the submission, so a replay of the same move cannot write twice.
 */
export function crmIntents(args: {
  submissionId: string;
  form: StepForm;
  answers: StepFormAnswers;
  taskTitle: string;
  moverId: string;
  timezone?: string | null;
}): CrmActivityIntent[] {
  const { outcome, followUp } = stepFormCrmAnswers(args.form, args.answers);
  const out: CrmActivityIntent[] = [];
  if (outcome) {
    const note = args.form.fields.find((f) => f.type === 'note' && typeof args.answers[f.id] === 'string');
    const noteText = note ? String(args.answers[note.id]) : '';
    out.push({
      clientId: `${args.submissionId}-outcome`,
      type: 'NOTE',
      body: `${args.taskTitle} — ${outcome.label}: ${outcome.value}${noteText ? `\n\n${noteText}` : ''}`,
    });
  }
  if (followUp) {
    out.push({
      clientId: `${args.submissionId}-followup`,
      type: 'REMINDER',
      body: `${followUp.label}: ${args.taskTitle}`,
      dueAt: zonedWallTimeToUtc(followUp.date, 9, 0, zoneOf(args.timezone)).toISOString(),
      reminderKind: 'OTHER',
      reminderAssigneeId: args.moverId,
    });
  }
  return out;
}

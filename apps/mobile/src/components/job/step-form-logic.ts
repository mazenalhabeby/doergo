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
/* ---------------- reading submissions ---------------- */

export type { StepSubmission } from '../../lib/api/types';

export {
  type WorkflowWithForms,
  formForMove,
  moveKind,
  workflowAsks,
  groupOf,
  SINGLE_SCREEN_FIELDS,
  paginateForm,
  type DraftPhoto,
  type FormDraft,
  emptyDraft,
  parseNumber,
  draftAnswers,
  draftErrors,
  pageComplete,
  stillNeeded,
} from './step-form-logic/draft';
export {
  filesToSend,
  finalAnswers,
  type SentFile,
  signatureFile,
  prepareStepForm,
  reasonFromAnswers,
  refusalFieldErrors,
  errorKey,
} from './step-form-logic/send';
export { fieldLabel, formCounts, isoDay, dayOf, shownAnswer } from './step-form-logic/labels';

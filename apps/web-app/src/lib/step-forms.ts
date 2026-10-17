/**
 * Step forms on the web — "Ask when a job moves here".
 *
 * The rules live in shared (`workflows/step-form`): what a definition may be,
 * which form a step asks, whether answers are acceptable. This file is only the
 * web's side of them — turning builder state into what the API takes, deciding
 * whether THIS mover owes answers, and turning refusals back into something a
 * field can show. Pure: no React, no fetch, so every rule here is tested.
 */
export { STEP_FORM_LIMITS } from "@hbcfield/shared/client"

export {
  type StepFormDraft,
  draftFromStored,
  draftToPayload,
  draftChanged,
  moveField,
  newField,
  presetDraft,
  askNothingDraft,
  builderStepMode,
  type DefinitionErrors,
  definitionErrors,
  definitionRefusal,
  crmLinkFree,
  crmLinkFor,
} from './step-forms/builder';
export {
  type MoverWorkflow,
  stepFormForMove,
  type DraftValue,
  PENDING_FILE_PREFIX,
  buildAnswers,
  type AnswerErrors,
  checkAnswers,
  answerRefusal,
  isStepFormRefusal,
  stepFieldLabel,
} from './step-forms/answers';

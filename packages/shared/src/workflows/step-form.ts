/**
 * Step forms — "Ask when a job moves here".
 *
 * Every workflow step may carry a FORM: an ordered list of fields the member
 * answers when a job moves INTO that step. The answers are stored as the job's
 * report for that move. This replaces the hard-coded service report (summary,
 * before/after photos, two signatures, a customer name) with the
 * organization's own definition — and lets ANY step ask, not only a final one.
 *
 * ⚠️ PURE AND DEPENDENCY-FREE. The builder, the phone and the server all judge
 * a definition and a set of answers with these functions, so "the phone let
 * me send it" and "the server refused it" can only disagree when the phone is
 * lying — and the server never trusts it: it re-runs `validateStepAnswers`.
 *
 * ⚠️ DATA, NEVER CODE. No formulas, no conditions, no scripts. A field is a
 * type, a label, required-or-not, and (for a choice) its options. Anything
 * else on a definition is refused rather than stored.
 *
 * ⚠️ TWO DIFFERENT "NO FORM"s:
 *   - `form: null` on a step = NOT SET. The legacy rule still applies: a final
 *     step with the `report` capability asks the field-service report
 *     (`effectiveStepForm`), so nothing changes for a workflow until edited.
 *   - `form: { fields: [] }` = SET TO NOTHING. The organization decided this
 *     step asks nothing — including a legacy report step.
 */
export {
  STEP_FORM_FIELD_TYPES,
  type StepFormFieldType,
  STEP_FORM_CRM_LINKS,
  type StepFormCrmLink,
  type StepFormField,
  type StepForm,
  type StepFormAnswerValue,
  type StepFormAnswers,
  STEP_FORM_LIMITS,
  isStepFormFieldType,
  newStepFormFieldId,
} from './step-form/types';
export {
  type StepFormDefinitionErrorCode,
  type StepFormDefinitionError,
  type StepFormDefinitionResult,
  validateStepFormDefinition,
  sameStepFormFields,
  nextStepForm,
  parseStoredStepForm,
} from './step-form/definition';
export {
  type StepAnswerErrorCode,
  type StepAnswerError,
  type StepAnswersResult,
  validateStepAnswers,
  stepFormFileIds,
  stepFormCrmAnswers,
} from './step-form/answers';
export {
  type StepFormPresetId,
  STEP_FORM_PRESETS,
  STEP_FORM_PRESET_IDS,
  stepFormPreset,
  type StepFormStep,
  type StepFormSource,
  resolveStepForm,
  effectiveStepForm,
  STEP_FORM_REFUSAL,
} from './step-form/presets';

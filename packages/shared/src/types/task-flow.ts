/**
 * Dynamic task flow + capabilities.
 *
 * A task's behaviour is data-driven, not hardcoded to "field service":
 *   - the STATUS FLOW comes from its StatusWorkflow (WorkflowStatus[]),
 *   - the EXECUTION CAPABILITIES (gps, timer, report, …) come from a preset
 *     keyed by the workflow.
 *
 * Web, mobile and the API all read this single module so a new task type is
 * config — not code in three places. (SRP + Open/Closed: add a capability or a
 * preset without touching the consumers.)
 */
export {
  type TaskCapability,
  type FlowStatus,
  FIELD_SERVICE_FLOW,
  WORKFLOW_CAPABILITIES,
  DEFAULT_CAPABILITIES,
  normalizeWorkflowKey,
  getTaskCapabilities,
  hasCapability,
  STATUS_CAPABILITIES,
  getStatusCapabilities,
  getFlowSteps,
} from './task-flow/capabilities';
export {
  type WorkflowTemplateStatus,
  type WorkflowTemplate,
  WORKFLOW_TEMPLATES,
  DEFAULT_WORKFLOW_TEMPLATE,
  getFlowIndex,
  getNextStep,
  flowTracksLocation,
} from './task-flow/templates';

import type { StepForm, StepFormField } from '@hbcfield/shared/client';

// ============================================================================
// STATUS WORKFLOWS TYPES & API
// ============================================================================

export interface StatusWorkflow {
  id: string;
  name: string;
  /**
   * What the TASK carries throughout its life — sprint, story points, epic,
   * phase, subtasks, dependencies, crm. Distinct from a status's capabilities,
   * which say what the member does at one step.
   */
  capabilities?: string[];
  isDefault: boolean;
  isActive: boolean;
  organizationId: string;
  /** Set → this space's own task type. Null → the whole organization's. */
  ownerSpaceId?: string | null;
  ownerSpace?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  statuses?: WorkflowStatus[];
}


export interface WorkflowStatus {
  id: string;
  workflowId: string;
  name: string;
  /**
   * Translation key, present only when the step came from a shipped template.
   * Render with `workflowStatusLabel(status, t)` — never `status.name` directly,
   * or a German organisation reads "On The Way" in an otherwise German app.
   */
  nameKey?: string | null;
  key: string;
  color: string;
  icon: string | null;
  position: number;
  isFinal: boolean;
  isCanceled: boolean;
  transitions: string[];
  capabilities?: string[];
  wipLimit?: number | null;
  /**
   * "Ask when a job moves here" — the step's own form, or null when not set
   * (then the legacy rule applies: a final `report` step asks the field-service
   * report). `{ fields: [] }` = set to ask nothing. See `resolveStepForm`.
   */
  form?: StepForm | null;
  createdAt: string;
}


/** What a step's form is SENT as: no version (the server decides it). `null` clears it. */
export type StepFormInput = { fields: Array<Omit<StepFormField, 'id'> & { id?: string }> } | null;


/** A task type in the shared library, as a tenant sees it. */
export interface WorkflowLibraryTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  industry: string | null;
  icon: string | null;
  statuses: WorkflowStatus[];
}

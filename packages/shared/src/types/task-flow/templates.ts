/** The built-in workflow templates, a step's place in a flow, the next step, and whether a flow travels. */
import { getTaskCapabilities, type FlowStatus, type TaskCapability } from './capabilities';
import { TEMPLATES_FIRST } from './templates-first';
import { TEMPLATES_REST } from './templates-rest';

// ============================================================================
// Task-type templates — ready-made flows so a new task type isn't built from
// scratch. ONE source of truth for the flows the platform SHIPS: task-service
// seeds these into the shared library at boot (where curators can then add to
// them without a deploy), and auth-service gives a brand-new organization the
// first one as its default type. (DRY)
//
// Clients do NOT read this list. They fetch the library, because it can carry
// templates that were curated rather than shipped, and because the statuses of
// a new task type are then decided server-side rather than by the browser.
// ============================================================================

export interface WorkflowTemplateStatus {
  name: string;
  key: string;
  color: string;
  icon?: string;
  position: number;
  isFinal: boolean;
  isCanceled: boolean;
  transitions: string[];
  capabilities: TaskCapability[];
}

export interface WorkflowTemplate {
  /** Stable id used by the picker (also the normalized capability key). */
  id: string;
  name: string;
  description: string;
  statuses: WorkflowTemplateStatus[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [...TEMPLATES_FIRST, ...TEMPLATES_REST];

/** The template seeded as a new organization's default task type. */
export const DEFAULT_WORKFLOW_TEMPLATE: WorkflowTemplate = WORKFLOW_TEMPLATES[0]!;

/** Index of a status key within the flow (−1 if absent). */
export function getFlowIndex(steps: FlowStatus[], statusKey: string): number {
  return steps.findIndex((s) => s.key === statusKey);
}

/** The primary "advance" target from the current status (skips cancel states). */
export function getNextStep(steps: FlowStatus[], statusKey: string): FlowStatus | null {
  const cur = steps.find((s) => s.key === statusKey);
  if (cur && cur.transitions.length) {
    const nextKey = cur.transitions.find((k) => {
      const t = steps.find((s) => s.key === k);
      return t && !t.isCanceled && !t.isFinal ? true : t && !t.isCanceled;
    });
    if (nextKey) return steps.find((s) => s.key === nextKey) ?? null;
  }
  // fallback: next by position
  const idx = getFlowIndex(steps, statusKey);
  return idx >= 0 && idx < steps.length - 1 ? steps[idx + 1]! : null;
}

/**
 * Does this task type track location ANYWHERE in its flow?
 *
 * Not "is it tracking right now". The question is asked to decide whether a
 * route is worth offering, and a visit sitting at its first step has not
 * reached the driving part yet — it still belongs on tomorrow's route.
 *
 * ⚠️ Coordinates are NOT the test, and that is the whole point of this
 * function. A task can carry a perfectly good pin and sit on a flow with no
 * travel step in it at all — a support ticket with the customer's address on
 * it, say — so a route built from "has a pin" quietly includes jobs nobody
 * drives to, and no screen explains why they are there.
 *
 * The workflow's OWN statuses win when present, because an admin may edit
 * them per organization; the shared preset answers only for a task whose flow
 * carries no capability data (legacy rows, and tasks with no workflow at all).
 */
export function flowTracksLocation(
  statuses?: { capabilities?: string[] | null }[] | null,
  workflowName?: string | null,
): boolean {
  if (statuses && statuses.length > 0) {
    return statuses.some((s) => (s.capabilities ?? []).includes('gps'));
  }
  return getTaskCapabilities(workflowName).includes('gps');
}

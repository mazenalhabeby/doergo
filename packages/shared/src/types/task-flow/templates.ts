/** The built-in workflow templates, a step's place in a flow, the next step, and whether a flow travels. */
import { getTaskCapabilities, type FlowStatus, type TaskCapability } from './capabilities';

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

const C = {
  slate: '#64748b',
  blue: '#2563EB',
  purple: '#7c3aed',
  amber: '#CA8A04',
  green: '#16A34A',
  red: '#DC2626',
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'field-service',
    name: 'Field Service',
    description: 'Dispatch → travel → on-site work → completion, with GPS, photos & sign-off.',
    statuses: [
      { name: 'Assigned',    key: 'ASSIGNED',    color: C.slate,  icon: 'checkmark', position: 0, isFinal: false, isCanceled: false, transitions: ['ACCEPTED', 'CANCELED'], capabilities: [] },
      { name: 'Accepted',    key: 'ACCEPTED',    color: C.blue,   icon: 'checkmark', position: 1, isFinal: false, isCanceled: false, transitions: ['EN_ROUTE', 'CANCELED'], capabilities: ['timer'] },
      { name: 'On The Way',  key: 'EN_ROUTE',    color: C.blue,   icon: 'car',       position: 2, isFinal: false, isCanceled: false, transitions: ['ARRIVED'], capabilities: ['gps', 'timer'] },
      { name: 'Arrived',     key: 'ARRIVED',     color: C.purple, icon: 'location',  position: 3, isFinal: false, isCanceled: false, transitions: ['IN_PROGRESS'], capabilities: ['timer'] },
      { name: 'In Progress', key: 'IN_PROGRESS', color: C.amber,  icon: 'construct', position: 4, isFinal: false, isCanceled: false, transitions: ['COMPLETED', 'BLOCKED'], capabilities: ['timer'] },
      { name: 'Blocked',     key: 'BLOCKED',     color: C.red,    icon: 'alert',     position: 5, isFinal: false, isCanceled: false, transitions: ['IN_PROGRESS'], capabilities: ['timer'] },
      { name: 'Completed',   key: 'COMPLETED',   color: C.green,  icon: 'checkmark', position: 6, isFinal: true,  isCanceled: false, transitions: [], capabilities: ['report', 'photos', 'signature'] },
      { name: 'Canceled',    key: 'CANCELED',    color: C.slate,  icon: 'close',     position: 7, isFinal: false, isCanceled: true,  transitions: [], capabilities: [] },
    ],
  },
  {
    id: 'logistics',
    name: 'Delivery / Logistics',
    description: 'Pick-up → in-transit → delivered, with GPS tracking and proof of delivery.',
    statuses: [
      { name: 'Assigned',   key: 'ASSIGNED',   color: C.slate,  icon: 'checkmark', position: 0, isFinal: false, isCanceled: false, transitions: ['ACCEPTED', 'CANCELED'], capabilities: [] },
      { name: 'Accepted',   key: 'ACCEPTED',   color: C.blue,   icon: 'checkmark', position: 1, isFinal: false, isCanceled: false, transitions: ['PICKED_UP', 'CANCELED'], capabilities: ['gps'] },
      { name: 'Picked Up',  key: 'PICKED_UP',  color: C.purple, icon: 'cube',      position: 2, isFinal: false, isCanceled: false, transitions: ['IN_TRANSIT'], capabilities: ['timer', 'photos'] },
      { name: 'In Transit', key: 'IN_TRANSIT', color: C.blue,   icon: 'car',       position: 3, isFinal: false, isCanceled: false, transitions: ['DELIVERED'], capabilities: ['gps', 'timer'] },
      { name: 'Delivered',  key: 'DELIVERED',  color: C.green,  icon: 'checkmark', position: 4, isFinal: true,  isCanceled: false, transitions: [], capabilities: ['photos', 'signature'] },
      { name: 'Canceled',   key: 'CANCELED',   color: C.slate,  icon: 'close',     position: 5, isFinal: false, isCanceled: true,  transitions: [], capabilities: [] },
    ],
  },
  {
    id: 'office',
    name: 'Office Task',
    description: 'A simple to-do board: To Do → Doing → Done, with a time-on-task timer.',
    statuses: [
      { name: 'To Do',    key: 'TODO',     color: C.slate, icon: 'list',      position: 0, isFinal: false, isCanceled: false, transitions: ['DOING', 'CANCELED'], capabilities: [] },
      { name: 'Doing',    key: 'DOING',    color: C.amber, icon: 'construct', position: 1, isFinal: false, isCanceled: false, transitions: ['DONE', 'CANCELED'], capabilities: ['timer', 'checklist'] },
      { name: 'Done',     key: 'DONE',     color: C.green, icon: 'checkmark', position: 2, isFinal: true,  isCanceled: false, transitions: [], capabilities: [] },
      { name: 'Canceled', key: 'CANCELED', color: C.slate, icon: 'close',     position: 3, isFinal: false, isCanceled: true,  transitions: [], capabilities: [] },
    ],
  },
  {
    id: 'sales',
    name: 'Sales Visit',
    description: 'Scheduled → on the way → visited → outcome, with GPS and a visit form.',
    statuses: [
      { name: 'Scheduled', key: 'SCHEDULED', color: C.slate,  icon: 'calendar',  position: 0, isFinal: false, isCanceled: false, transitions: ['EN_ROUTE', 'CANCELED'], capabilities: [] },
      { name: 'On The Way', key: 'EN_ROUTE', color: C.blue,   icon: 'car',       position: 1, isFinal: false, isCanceled: false, transitions: ['VISITED'], capabilities: ['gps', 'timer'] },
      { name: 'Visited',   key: 'VISITED',   color: C.purple, icon: 'location',  position: 2, isFinal: false, isCanceled: false, transitions: ['OUTCOME'], capabilities: ['gps', 'timer', 'form'] },
      { name: 'Outcome',   key: 'OUTCOME',   color: C.green,  icon: 'checkmark', position: 3, isFinal: true,  isCanceled: false, transitions: [], capabilities: ['form'] },
      { name: 'Canceled',  key: 'CANCELED',  color: C.slate,  icon: 'close',     position: 4, isFinal: false, isCanceled: true,  transitions: [], capabilities: [] },
    ],
  },
  {
    id: 'inspection',
    name: 'Inspection / Audit',
    description: 'On-site inspection with a checklist, evidence photos and a final sign-off.',
    statuses: [
      { name: 'Assigned',    key: 'ASSIGNED',    color: C.slate, icon: 'checkmark', position: 0, isFinal: false, isCanceled: false, transitions: ['IN_PROGRESS', 'CANCELED'], capabilities: [] },
      { name: 'In Progress', key: 'IN_PROGRESS', color: C.amber, icon: 'construct', position: 1, isFinal: false, isCanceled: false, transitions: ['SUBMITTED', 'BLOCKED'], capabilities: ['timer', 'checklist', 'photos'] },
      { name: 'Blocked',     key: 'BLOCKED',     color: C.red,   icon: 'alert',     position: 2, isFinal: false, isCanceled: false, transitions: ['IN_PROGRESS'], capabilities: ['timer'] },
      { name: 'Submitted',   key: 'SUBMITTED',   color: C.green, icon: 'checkmark', position: 3, isFinal: true,  isCanceled: false, transitions: [], capabilities: ['signature'] },
      { name: 'Canceled',    key: 'CANCELED',    color: C.slate, icon: 'close',     position: 4, isFinal: false, isCanceled: true,  transitions: [], capabilities: [] },
    ],
  },
];

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

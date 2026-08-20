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

export type TaskCapability =
  | 'gps'        // live location / route tracking (En-route → Arrived)
  | 'timer'      // time-on-task
  | 'checklist'  // checklist / pass-fail items
  | 'photos'     // before/after or evidence photos
  | 'signature'  // customer / sign-off signature
  | 'report'     // service report (work performed, parts)
  | 'form';      // visit notes / outcome form

/** A normalized status in a flow (mirrors the WorkflowStatus DB model). */
export interface FlowStatus {
  key: string;
  label: string;
  icon?: string | null;
  color: string;
  position: number;
  isFinal: boolean;
  isCanceled: boolean;
  transitions: string[];
  capabilities?: TaskCapability[];
}

/**
 * Built-in field-service flow — used when a task has no custom workflow so the
 * existing technician experience is byte-for-byte preserved.
 */
export const FIELD_SERVICE_FLOW: FlowStatus[] = [
  { key: 'ASSIGNED',    label: 'Assigned',    icon: 'checkmark',  color: '#64748b', position: 0, isFinal: false, isCanceled: false, transitions: ['ACCEPTED', 'CANCELED'] },
  { key: 'ACCEPTED',    label: 'Accepted',    icon: 'checkmark',  color: '#2563EB', position: 1, isFinal: false, isCanceled: false, transitions: ['EN_ROUTE'] },
  { key: 'EN_ROUTE',    label: 'On The Way',  icon: 'car',        color: '#2563EB', position: 2, isFinal: false, isCanceled: false, transitions: ['ARRIVED'] },
  { key: 'ARRIVED',     label: 'Arrived',     icon: 'location',   color: '#7c3aed', position: 3, isFinal: false, isCanceled: false, transitions: ['IN_PROGRESS'] },
  { key: 'IN_PROGRESS', label: 'In Progress', icon: 'construct',  color: '#CA8A04', position: 4, isFinal: false, isCanceled: false, transitions: ['COMPLETED', 'BLOCKED'] },
  { key: 'COMPLETED',   label: 'Completed',   icon: 'checkmark',  color: '#16A34A', position: 5, isFinal: true,  isCanceled: false, transitions: [] },
];

/** Capability presets keyed by a normalized workflow name/slug. */
export const WORKFLOW_CAPABILITIES: Record<string, TaskCapability[]> = {
  'field-service': ['gps', 'timer', 'photos', 'report', 'signature'],
  'logistics':     ['gps', 'timer', 'photos', 'signature'],
  'delivery':      ['gps', 'timer', 'photos', 'signature'],
  'office':        ['timer', 'checklist'],
  'admin':         ['timer', 'checklist'],
  'sales':         ['gps', 'timer', 'form'],
  'visit':         ['gps', 'timer', 'form'],
  'inspection':    ['checklist', 'photos', 'signature', 'timer'],
  'audit':         ['checklist', 'photos', 'signature', 'timer'],
};

/** Default when a task has no workflow / an unknown one → full field-service. */
export const DEFAULT_CAPABILITIES: TaskCapability[] = WORKFLOW_CAPABILITIES['field-service']!;

export function normalizeWorkflowKey(name?: string | null): string {
  return (name || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

/** Capabilities for a workflow (by name); falls back to field-service. */
export function getTaskCapabilities(workflowName?: string | null): TaskCapability[] {
  const key = normalizeWorkflowKey(workflowName);
  // exact match first, then a contains-match (e.g. "Field Service v2")
  if (WORKFLOW_CAPABILITIES[key]) return WORKFLOW_CAPABILITIES[key]!;
  const partial = Object.keys(WORKFLOW_CAPABILITIES).find((k) => key.includes(k));
  return partial ? WORKFLOW_CAPABILITIES[partial]! : DEFAULT_CAPABILITIES;
}

export function hasCapability(caps: TaskCapability[] | undefined, c: TaskCapability): boolean {
  return Array.isArray(caps) && caps.includes(c);
}

/**
 * Per-status capabilities — which execution widgets are active AT each step,
 * keyed by [normalized workflow][status key]. This is what makes every screen
 * in the flow distinct (GPS only while travelling, report only at completion).
 * The field-service map reproduces the original technician behaviour exactly and
 * is the default for workflow-less tasks, so nothing regresses.
 */
export const STATUS_CAPABILITIES: Record<string, Record<string, TaskCapability[]>> = {
  'field-service': {
    ASSIGNED: [], ACCEPTED: ['timer'], EN_ROUTE: ['gps', 'timer'],
    ARRIVED: ['timer'], IN_PROGRESS: ['timer'], BLOCKED: ['timer'],
    COMPLETED: ['report', 'photos', 'signature'],
  },
  'logistics': {
    ASSIGNED: [], ACCEPTED: ['gps'], PICKED_UP: ['timer'],
    IN_TRANSIT: ['gps', 'timer'], DELIVERED: ['photos', 'signature'],
  },
  'office': { TODO: [], DOING: ['timer', 'checklist'], DONE: [] },
  'sales': {
    SCHEDULED: [], EN_ROUTE: ['gps', 'timer'], VISITED: ['gps', 'timer', 'form'], OUTCOME: ['form'],
  },
  'inspection': {
    ASSIGNED: [], IN_PROGRESS: ['timer', 'checklist', 'photos'], SUBMITTED: ['signature'],
  },
};

/**
 * Capabilities active at a given status. Falls back to the field-service map for
 * unknown/absent workflows so workflow-less tasks behave exactly as before.
 */
export function getStatusCapabilities(workflowName: string | null | undefined, statusKey: string): TaskCapability[] {
  const key = normalizeWorkflowKey(workflowName) || 'field-service';
  let perWf = STATUS_CAPABILITIES[key];
  if (!perWf) {
    const partial = Object.keys(STATUS_CAPABILITIES).find((k) => key.includes(k));
    perWf = partial ? STATUS_CAPABILITIES[partial]! : STATUS_CAPABILITIES['field-service']!;
  }
  return perWf[statusKey] ?? [];
}

/**
 * Ordered flow steps from a task's workflow, or the field-service default.
 * Normalizes the DB WorkflowStatus shape (which uses `name`) into FlowStatus
 * (which uses `label`) and fills sane defaults — so consumers never read
 * undefined labels/transitions.
 */
export function getFlowSteps(
  workflow?: { statuses?: Array<Partial<FlowStatus> & { name?: string }> } | null,
): FlowStatus[] {
  const st = workflow?.statuses;
  if (st && st.length) {
    return st
      .map((s) => ({
        key: s.key ?? '',
        label: s.label ?? s.name ?? s.key ?? '',
        icon: s.icon ?? null,
        color: s.color ?? '#3b82f6',
        position: s.position ?? 0,
        isFinal: !!s.isFinal,
        isCanceled: !!s.isCanceled,
        transitions: s.transitions ?? [],
        capabilities: (s as { capabilities?: TaskCapability[] }).capabilities ?? undefined,
      }))
      .sort((a, b) => a.position - b.position);
  }
  return FIELD_SERVICE_FLOW;
}

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

export function getWorkflowTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}

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

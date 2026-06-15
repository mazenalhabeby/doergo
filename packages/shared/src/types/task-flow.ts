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

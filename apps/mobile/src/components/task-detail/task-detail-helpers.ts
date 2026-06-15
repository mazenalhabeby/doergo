import { Ionicons } from '@expo/vector-icons';
import { TaskStatus } from '../../lib/api';
import { FlowStatus, getNextStep, FIELD_SERVICE_FLOW } from '@hbcfield/shared/client';

// Fallback field-service stepper (used when a task has no workflow).
export const PROGRESS_STEPS = [
  { key: TaskStatus.ASSIGNED, label: 'Assigned', icon: 'checkmark' as const },
  { key: TaskStatus.ACCEPTED, label: 'Accepted', icon: 'checkmark' as const },
  { key: TaskStatus.EN_ROUTE, label: 'On The Way', icon: 'car' as const },
  { key: TaskStatus.ARRIVED, label: 'Arrived', icon: 'location' as const },
  { key: TaskStatus.IN_PROGRESS, label: 'In Progress', icon: 'construct' as const },
  { key: TaskStatus.COMPLETED, label: 'Completed', icon: 'checkmark' as const },
] as const;

// Default Ionicons for the canonical field-service status keys.
const ICON_BY_KEY: Record<string, string> = {
  ASSIGNED: 'checkmark', ACCEPTED: 'checkmark', EN_ROUTE: 'car',
  ARRIVED: 'location', IN_PROGRESS: 'construct', BLOCKED: 'alert',
  COMPLETED: 'checkmark', DELIVERED: 'checkmark', DONE: 'checkmark',
  SUBMITTED: 'checkmark', PICKED_UP: 'cube', IN_TRANSIT: 'car',
  VISITED: 'location', SCHEDULED: 'calendar', OUTCOME: 'document-text',
};

/** Stepper steps from a flow (cancel states excluded, icon resolved). */
export function getProgressSteps(flowSteps: FlowStatus[]): { key: string; label: string; icon: string }[] {
  return flowSteps
    .filter((s) => !s.isCanceled)
    .map((s) => ({ key: s.key, label: s.label, icon: s.icon || ICON_BY_KEY[s.key] || 'ellipse' }));
}

// Index of the current status within the (visible) flow steps.
export function getDetailProgressIndex(status: string, flowSteps?: FlowStatus[]): number {
  const steps = flowSteps && flowSteps.length ? getProgressSteps(flowSteps) : null;
  if (steps) {
    const i = steps.findIndex((s) => s.key === status);
    if (i >= 0) return i;
    if (status === TaskStatus.BLOCKED) {
      const ip = steps.findIndex((s) => s.key === TaskStatus.IN_PROGRESS);
      return ip >= 0 ? ip : Math.max(0, steps.length - 2);
    }
    if (status === TaskStatus.CLOSED) return steps.length - 1;
    return -1;
  }
  // Legacy field-service mapping (no workflow)
  switch (status) {
    case TaskStatus.ASSIGNED: return 0;
    case TaskStatus.ACCEPTED: return 1;
    case TaskStatus.EN_ROUTE: return 2;
    case TaskStatus.ARRIVED: return 3;
    case TaskStatus.IN_PROGRESS: return 4;
    case TaskStatus.COMPLETED:
    case TaskStatus.CLOSED: return 5;
    case TaskStatus.BLOCKED: return 4;
    default: return -1;
  }
}

// Get next status action based on current status
export interface StatusAction {
  nextStatus: TaskStatus;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// Nicer labels/icons for the canonical field-service transitions, keyed by the
// CURRENT status. Custom workflows fall back to a generic "Next: <label>".
const BUILTIN_ACTIONS: Record<string, { next: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  [TaskStatus.ASSIGNED]:    { next: TaskStatus.ACCEPTED,    label: 'Accept Job',    icon: 'checkmark-circle' },
  [TaskStatus.ACCEPTED]:    { next: TaskStatus.EN_ROUTE,    label: 'Start Driving', icon: 'car' },
  [TaskStatus.EN_ROUTE]:    { next: TaskStatus.ARRIVED,     label: "I've Arrived",  icon: 'location' },
  [TaskStatus.ARRIVED]:     { next: TaskStatus.IN_PROGRESS, label: 'Start Work',    icon: 'construct' },
  [TaskStatus.IN_PROGRESS]: { next: TaskStatus.COMPLETED,   label: 'Finish Job',    icon: 'checkmark-done' },
  [TaskStatus.BLOCKED]:     { next: TaskStatus.IN_PROGRESS, label: 'Resume Job',    icon: 'play' },
};

export function getStatusAction(status: string, flowSteps?: FlowStatus[]): StatusAction | null {
  const steps = flowSteps && flowSteps.length ? flowSteps : FIELD_SERVICE_FLOW;
  const next = getNextStep(steps, status);
  const builtin = BUILTIN_ACTIONS[status];
  if (next) {
    return {
      nextStatus: next.key as TaskStatus,
      label: builtin?.label ?? `Next: ${next.label}`,
      icon: builtin?.icon ?? 'arrow-forward-circle',
    };
  }
  // BLOCKED (a side state not in the linear flow) resumes via the builtin map.
  if (builtin) return { nextStatus: builtin.next as TaskStatus, label: builtin.label, icon: builtin.icon };
  return null;
}

// Format elapsed time for timer display (HH:MM:SS)
/** Human-readable elapsed time in days/hours/minutes: "34d 23h 11m" / "2h 5m". */
export function formatElapsedTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
}

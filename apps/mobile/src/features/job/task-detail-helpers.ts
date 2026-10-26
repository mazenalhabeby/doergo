import type { IconName } from '@hbcfield/shared/client';
/*
  TaskStatus comes from shared, not from `../../lib/api`.

  This file is pure logic — it decides which step a task moves to next — but
  importing the API barrel dragged the whole client in behind it: SecureStore,
  expo-constants, react-native. That made the one thing worth testing here
  untestable under the mobile runner, which is deliberately React-Native-free.
  The enum is the same enum; the barrel merely re-exports it.
*/
import { TaskStatus, FlowStatus, getNextStep, FIELD_SERVICE_FLOW } from '@hbcfield/shared/client';

// Fallback field-service stepper (used when a task has no workflow).
// Default Ionicons for the canonical field-service status keys.
// Index of the current status within the (visible) flow steps.
// Get next status action based on current status
interface StatusAction {
  nextStatus: TaskStatus;
  label: string;
  icon: IconName;
}

// Nicer labels/icons for the canonical field-service transitions, keyed by the
// CURRENT status. Custom workflows fall back to a generic "Next: <label>".
const BUILTIN_ACTIONS: Record<string, { next: string; label: string; icon: IconName }> = {
  [TaskStatus.ASSIGNED]: { next: TaskStatus.ACCEPTED, label: 'Accept Job', icon: 'selected' },
  [TaskStatus.ACCEPTED]: { next: TaskStatus.EN_ROUTE, label: 'Start Driving', icon: 'car' },
  [TaskStatus.EN_ROUTE]: { next: TaskStatus.ARRIVED, label: "I've Arrived", icon: 'pin' },
  [TaskStatus.ARRIVED]: { next: TaskStatus.IN_PROGRESS, label: 'Start Work', icon: 'tools' },
  [TaskStatus.IN_PROGRESS]: { next: TaskStatus.COMPLETED, label: 'Finish Job', icon: 'checkRead' },
  [TaskStatus.BLOCKED]: { next: TaskStatus.IN_PROGRESS, label: 'Resume Job', icon: 'play' },
};

export function getStatusAction(status: string, flowSteps?: FlowStatus[]): StatusAction | null {
  const steps = flowSteps && flowSteps.length ? flowSteps : FIELD_SERVICE_FLOW;
  const next = getNextStep(steps, status);
  const builtin = BUILTIN_ACTIONS[status];
  if (next) {
    /*
      ⚠️ The friendly label is only borrowed when it describes the step this
      actually takes.

      BUILTIN_ACTIONS is keyed by the CURRENT status, so ASSIGNED used to read
      "Accept Job" on every workflow — including "Field Service", which has no
      ACCEPTED step and goes straight to EN_ROUTE. The button then said Accept
      and did something else. A label that names the wrong destination is worse
      than the plain "Next: En Route", because only one of them can be checked
      against what happens.
    */
    const labelFits = builtin?.next === next.key;
    return {
      nextStatus: next.key as TaskStatus,
      label: labelFits ? builtin!.label : `Next: ${next.label}`,
      icon: labelFits ? builtin!.icon : 'arrowRight',
    };
  }
  // BLOCKED (a side state not in the linear flow) resumes via the builtin map.
  if (builtin) return { nextStatus: builtin.next as TaskStatus, label: builtin.label, icon: builtin.icon };
  return null;
}

// Format elapsed time for timer display (HH:MM:SS)

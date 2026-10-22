/**
 * The job page's decisions — `docs/design/job-flow.html`, `decision()`.
 *
 * ⚠️ PURE AND REACT-NATIVE-FREE on purpose: every rule the page acts on is
 * tested here, not by eye. The screen only draws what these return.
 *
 * ⚠️ THE VERBS ARE THE WORKFLOW'S. Which step comes next, what it is called,
 * and whether it needs a report are read from the job's own flow — never
 * hardcoded to the field-service ladder, which is the bug `status-action.spec`
 * pins (an ASSIGNED job on a flow with no ACCEPTED step).
 */
import { getStatusCapabilities, hasCapability, type FlowStatus, type TaskCapability } from '@hbcfield/shared/client';
import { getStatusAction } from './task-detail-helpers';
import type { ChecklistItem } from '@/lib/api/types';
import { BLOCKED, IN_PROGRESS, isClosedStatus, type Decision } from './decision';
export {
  isClosedStatus,
  mainSteps,
  stepPosition,
  isCanceledStatus,
  capsAt,
  needsReport,
  checklistStep,
  dockMode,
  canDecline,
  type MoreOption,
  moreOptions,
  type OpenSheet,
  parseOpenSheet,
  formSheet,
  formSheetTarget,
  heldUntilDue,
  formatOnJob,
  type CheckItem,
  type ChecklistMode,
  checklistMode,
  withTick,
  patchOptimistic,
  tickOptimistic,
  type Severity,
  issueReason,
} from './decision';

/**
 * The next step, and the others — `decision()` in the mockup.
 *
 *  - onward = the current step's transitions, minus any cancel state (called
 *    off is the office's decision, not a step the member takes)
 *  - BLOCKED → the step it resumes to, labelled "Back to work"
 *  - otherwise the first onward step in flow order that is not Blocked;
 *    Blocked itself goes to ⋯ as "Report an issue"
 *  - a step with no transitions written falls back to the next by position
 */
export function decideNext(status: string, steps: readonly FlowStatus[]): Decision {
  if (isClosedStatus(status, steps)) return { primary: null, rest: [], resume: false };
  const cur = steps.find((s) => s.key === status);
  const canceled = (k: string) => k === 'CANCELED' || !!steps.find((s) => s.key === k)?.isCanceled;
  const onward = (cur?.transitions ?? []).filter((k) => !canceled(k) && k !== status);

  if (status === BLOCKED) {
    const back = onward.find((k) => k !== BLOCKED) ?? IN_PROGRESS;
    return { primary: back, rest: onward.filter((k) => k !== back), resume: true };
  }

  if (onward.length === 0) {
    const fallback = getStatusAction(status, steps as FlowStatus[]);
    return { primary: fallback && !canceled(fallback.nextStatus) ? fallback.nextStatus : null, rest: [], resume: false };
  }

  const order = (k: string) => {
    const i = steps.findIndex((s) => s.key === k);
    return i < 0 ? 99 : i;
  };
  const sorted = [...onward].sort((a, b) => order(a) - order(b));
  const primary = sorted.find((k) => k !== BLOCKED) ?? sorted[0]!;
  return { primary, rest: sorted.filter((k) => k !== primary), resume: false };
}

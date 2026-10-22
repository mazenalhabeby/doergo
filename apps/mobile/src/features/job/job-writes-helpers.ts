import type { StepFormAnswers } from '@hbcfield/shared/client';
import { TaskStatus, type Task } from '@/lib/api';
import { type ActionOutcome } from '@/offline/tasks/task-actions';
import { taskDestination } from '@/offline/tasks/status-fix';
import { refusalText } from '@/lib/distance';

/** The types and pure helpers the job's writes share — moved here unchanged from use-job-writes.ts. */
/**
 * The one status write — `changeTaskStatus` through the outbox, with the GPS
 * fix taken by `takeStatusFix`. It lives on the SCREEN (`task/[id].tsx`) and is
 * handed in, so the screen stays the single place a status leaves the phone.
 */
export type WriteStatus = (task: Task, to: string, reason?: string, extras?: StatusExtras) => Promise<ActionOutcome>;

/** What a move into a step with a form carries beside the status. */
export interface StatusExtras {
  /** The step form's answers — photo and signature values are attachment ids of this job. */
  answers?: StepFormAnswers;
  /** The queued `task.attachment` operations those files are, still unsent — the move waits for them. */
  dependsOn?: string[];
}

/** How a move with a form ended: sent (or kept to send), or refused with the fields to point at. */
export type FormMoveResult = { ok: true } | { ok: false; fieldErrors?: Record<string, string> };

export interface Member {
  id: string;
  firstName: string;
  lastName: string;
}

export type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * A refusal in the member's language: the server's code first, its message
 * second. Exported because the Jobs tab's Next up card moves a job with the
 * same write and has to say the same sentence when it is refused.
 */
export function refusalMessage(
  t: Translate,
  o: { code?: string; message?: string; params?: Record<string, unknown>; conflict?: boolean },
): string {
  return refusalText(t, o, t(o.conflict ? 'offline.errors.CONFLICT' : 'taskDetail.failedToUpdateStatus'));
}

export interface RouteTracking {
  startTracking: (taskId: string, destination: ReturnType<typeof taskDestination>) => unknown;
  stopTracking: () => unknown;
}

/**
 * The route recorder follows the step: it starts on the way there and stops
 * on arrival. ⚠️ ONE RULE for the job page AND the Jobs tab — a step taken
 * from the list that skipped this would drive a route nobody records.
 */
export function trackRouteFor(tracking: RouteTracking, task: Task, from: string, to: string): void {
  if (from === TaskStatus.EN_ROUTE && to === TaskStatus.ARRIVED) tracking.stopTracking();
  if (to === TaskStatus.EN_ROUTE) void tracking.startTracking(task.id, taskDestination(task));
}

/** Put the recorder back the way it was when the step was refused. */
export function untrackRouteFor(tracking: RouteTracking, task: Task, from: string, to: string): void {
  if (from === TaskStatus.EN_ROUTE && to === TaskStatus.ARRIVED)
    void tracking.startTracking(task.id, taskDestination(task));
  if (to === TaskStatus.EN_ROUTE) tracking.stopTracking();
}

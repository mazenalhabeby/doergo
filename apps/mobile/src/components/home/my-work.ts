import { isTaskAssignee, getFlowSteps, getNextStep, type FlowStatus } from '@hbcfield/shared/client';
import type { Task } from '../../lib/api/types';

/**
 * The two axes, resolved separately.
 *
 * ⚠️ They do NOT interact — resolve the shape, then fill it. That is the only
 * reason twelve combinations are tractable, and it is why this file has two
 * functions rather than one big one.
 *
 *   WHICH MODULES YOU HOLD  →  the SHAPE   (strip of bars, dots, or both)
 *   WHICH JOBS YOU CAN SEE  →  the CONTENT (yours, the site's, the org's)
 */

/** Axis 1 — modules decide the shape. */
export type WorkShape =
  /** bars AND dots; the active row is a job, with the shift named above it */
  | 'both'
  /** dots, no bars; the active row is a job */
  | 'tasks'
  /**
   * bars, no dots; THE ACTIVE ROW IS THE SHIFT.
   *
   * ⚠️ This member is the bug the fold fixes. §3.2 says `my-tasks` is "Who:
   * Everyone", so somebody holding the clock and not tasks got a jobs card
   * every day, forever, empty — "Nothing scheduled today" about work they will
   * never be assigned.
   */
  | 'shifts'
  /** neither — the widget does not render at all */
  | 'none';

export function shapeFor(has: { tasks: boolean; clock: boolean }): WorkShape {
  if (has.tasks && has.clock) return 'both';
  if (has.tasks) return 'tasks';
  if (has.clock) return 'shifts';
  return 'none';
}

/** Axis 2 — grants decide the content. */
export type WorkFace =
  /** only jobs they are on. Nothing is marked "mine", because everything is. */
  | 'executor'
  /** two groups — MINE, then the site. The ONLY face that needs them. */
  | 'spaceSupervisor'
  /**
   * mine, then a three-figure strip. NOT a list.
   *
   * ⚠️ Reach changes the FORM, not the length. Forty-seven rows is not a
   * bigger version of three — it is a different question, and a home screen
   * that tries to list an organization is a home screen nobody reads.
   */
  | 'orgWide';

export function faceFor(caller: { canViewAllTasks?: boolean; role?: string | null; viewAllSpaceIds?: string[] }): WorkFace {
  if (caller.role === 'ADMIN' || caller.canViewAllTasks) return 'orgWide';
  /*
    ⚠️ Path 4, and it is missing from §3.2 — which names only `canViewAllTasks`.
    A member granted "view all tasks" IN THEIR WORKSPACE fell through to "only
    what is assigned to me", and could create a task in that workspace and then
    not be allowed to open it. Anything that re-derives visibility from
    `canViewAllTasks` alone reproduces that bug.
  */
  if ((caller.viewAllSpaceIds?.length ?? 0) > 0) return 'spaceSupervisor';
  return 'executor';
}

/** Local midnight of a date, so a day's jobs are a day's jobs in the member's own zone. */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday first, seven days. */
export function weekOf(anchor: Date): Date[] {
  const start = startOfDay(anchor);
  const shift = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - shift);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function tasksOn(tasks: Task[], day: Date): Task[] {
  const from = startOfDay(day).getTime();
  const to = from + 86_400_000;
  return tasks
    .filter((t) => {
      if (!t.dueDate) return false;
      const at = new Date(t.dueDate).getTime();
      return at >= from && at < to;
    })
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
}

/**
 * ⚠️ WEEK DOTS COME FROM DATES ALREADY IN HAND. No per-day fetch — the strip
 * and the list were always drawing from one pool, which is half the reason the
 * fold is free.
 */
export function dotsForWeek(tasks: Task[], week: Date[]): number[] {
  return week.map((d) => tasksOn(tasks, d).length);
}

export interface Decision {
  /** The primary — the next transition BY POSITION. */
  primary: FlowStatus;
  /**
   * Everything else, behind the `⋯`.
   *
   * ⚠️ TWO TRANSITIONS, NEVER TWO BUTTONS. §3.3 calls the row "deliberately a
   * single decision" and the flow says otherwise twice. Two equal buttons is
   * how somebody declines a job by accident — and this rule survives a
   * workflow with four onward transitions, which one-button-plus-one-link
   * does not.
   */
  rest: FlowStatus[];
}

/**
 * What this job offers, and whether it offers anything at all.
 *
 * ⚠️ THE ACTIVE ROW EXISTS ONLY WHEN THE FIRST JOB IS YOURS. A shared-space
 * supervisor sees rows and no verb — none of those jobs are theirs to act on.
 * Access decides whether there is a decision, not only what it says.
 *
 * ⚠️ AND THE VERB ITSELF IS NOT ACCESS'S BUSINESS. Labels come from
 * `FlowStatus.label`, which is organization-authored — two members with
 * different grants looking at the same job see the SAME verb; what differs is
 * whether they see it at all. Never hardcode the five.
 */
export function decisionFor(task: Task, userId: string | undefined): Decision | null {
  if (!userId) return null;
  const mine = isTaskAssignee(task as never, userId);
  // `isTaskAssignee` returns null when the co-assignee rows were not loaded.
  // It never guesses, and neither does this: no answer means no verb.
  if (mine !== true) return null;

  const steps = getFlowSteps((task as unknown as { workflow?: unknown }).workflow as never);
  const current = steps.find((s) => s.key === task.status);
  if (!current) return null;

  const onward = current.transitions
    .map((k) => steps.find((s) => s.key === k))
    .filter((s): s is FlowStatus => !!s && !s.isCanceled)
    .sort((a, b) => a.position - b.position);

  const next = getNextStep(steps, task.status);
  const primary = onward.find((s) => s.key === next?.key) ?? onward[0];
  if (!primary) return null;
  return { primary, rest: onward.filter((s) => s.key !== primary.key) };
}

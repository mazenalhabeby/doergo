import {
  isTaskAssignee, getFlowSteps, getStartOfDay,
  rankMyWork, workBand,
  type FlowStatus,
} from '@hbcfield/shared/client';
import type { ScheduleEntry, Task } from '../../lib/api/types';

/**
 * My work — the pure half. `docs/design/my-work/`.
 *
 * ⚠️ TWO AXES, RESOLVED SEPARATELY. They do not interact — resolve the shape,
 * then fill it. That is the only reason twelve combinations are tractable.
 *
 *   WHICH MODULES YOU HOLD  →  the SHAPE   (bars, dots, or both)
 *   WHICH JOBS YOU CAN SEE  →  the CONTENT (yours, the site's, the org's)
 *
 * ⚠️ NOTHING HERE CALLS THE SERVER. Every fact comes from rows the phone
 * already holds: `useHomeTasks()`, the member's own weekly schedule, and the
 * workflows the offline engine keeps.
 */

/** Axis 1 — modules decide the shape. */
export type WorkShape = 'both' | 'tasks' | 'shifts' | 'none';

export function shapeFor(has: { tasks: boolean; clock: boolean }): WorkShape {
  if (has.tasks && has.clock) return 'both';
  if (has.tasks) return 'tasks';
  /*
    ⚠️ A clock-only member was the bug the fold fixes: a jobs card every day,
    forever, empty. Their list is shifts.
  */
  if (has.clock) return 'shifts';
  return 'none';
}

/** Axis 2 — grants decide the content. */
export type WorkFace = 'executor' | 'spaceSupervisor' | 'orgWide';

export function faceFor(caller: { canViewAllTasks?: boolean; role?: string | null; viewAllSpaceIds?: string[] }): WorkFace {
  if (caller.role === 'ADMIN' || caller.canViewAllTasks) return 'orgWide';
  /*
    ⚠️ Path 4 — the SAME grant held by a space role. Re-deriving visibility
    from `canViewAllTasks` alone reproduces the bug recorded in task-access.ts.
  */
  if ((caller.viewAllSpaceIds?.length ?? 0) > 0) return 'spaceSupervisor';
  return 'executor';
}

/** The spaces where a space role grants "view all tasks". */
export function viewAllSpaceIds(perSpace: Record<string, unknown> | undefined): string[] {
  if (!perSpace) return [];
  return Object.entries(perSpace)
    .filter(([, g]) => !!(g as Record<string, boolean> | null)?.canViewAllTasks)
    .map(([id]) => id);
}

/** Local midnight, so a day's jobs are a day's jobs in the member's own zone. The shared rule, not a copy. */
export const startOfDay = (d: Date): Date => getStartOfDay(d);

/** Monday first, seven days. */
export function weekOf(anchor: Date): Date[] {
  const start = startOfDay(anchor);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function sameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
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
 * ⚠️ A DUE DATE AT LOCAL MIDNIGHT CARRIES NO HOUR — `appointment-times`. It is
 * a day, not "00:00", and printing 00:00 tells somebody to turn up at night.
 */
export function hasHour(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

/** `true` / `false`, or `null` when the assignee rows were not loaded — never a guess. */
export function isMine(task: Task, userId: string | undefined): boolean {
  if (!userId) return false;
  const answer = isTaskAssignee(task as never, userId);
  if (answer !== null) return answer;
  return task.assignedToId === userId;
}

/* ---------------- the workflow ---------------- */

/** The workflow a row runs on: its own, else its space's. */
export function flowIdOf(task: Task): string | null {
  const x = task as unknown as { workflowId?: string | null; space?: { workflowId?: string | null } | null };
  return x.workflowId ?? x.space?.workflowId ?? null;
}

/**
 * The steps this row's verb is read from.
 *
 * ⚠️ `null` WHEN THE ROW NAMES A WORKFLOW THIS PHONE DOES NOT HOLD. Falling
 * back to the field-service flow there would print verbs the organization
 * never wrote, and send transitions its workflow does not have. The row then
 * opens the job instead of guessing.
 */
export function stepsFor(task: Task, flows: Map<string, unknown>): FlowStatus[] | null {
  const id = flowIdOf(task);
  if (!id) return getFlowSteps(undefined);
  const flow = flows.get(id);
  return flow ? getFlowSteps(flow as never) : null;
}

export function isClosed(task: Task, steps: FlowStatus[] | null): boolean {
  const s = steps?.find((x) => x.key === task.status);
  if (s) return s.isFinal || s.isCanceled;
  return ['COMPLETED', 'CANCELED', 'CLOSED'].includes(task.status);
}





/* ---------------- the week ---------------- */

/**
 * The shift on a date, from the member's weekly schedule.
 *
 * ⚠️ `dayOfWeek` IS 0 = SUNDAY — the schema, the DTO and the validator in
 * technicians.service all say so, which is also `Date.getDay()`. The comment
 * in `time-off.tsx` claiming 0 = Monday is wrong; copying it put every bar
 * one day late.
 */
export function shiftOn(schedule: ScheduleEntry[], day: Date): ScheduleEntry | null {
  const dow = day.getDay();
  return schedule.find((e) => e.isActive && e.dayOfWeek === dow) ?? null;
}

/** Whole hours in a shift, for the eyebrow. `08:00`→`16:30` is 8.5. */
export function shiftHours(e: ScheduleEntry): number {
  const m = (s: string) => { const [h, mm] = s.split(':').map(Number); return (h ?? 0) * 60 + (mm ?? 0); };
  let span = m(e.endTime) - m(e.startTime);
  if (span <= 0) span += 24 * 60;
  return Math.round(span / 30) / 2;
}

/**
 * The next open job after `day`, this week or later — the second line of
 * "Nothing scheduled today", which comes free because the rows are in hand.
 */
export function nextJobAfter(tasks: Task[], day: Date, isOpen: (t: Task) => boolean): Task | null {
  const from = startOfDay(day).getTime() + 86_400_000;
  return tasks
    .filter((t) => t.dueDate && new Date(t.dueDate).getTime() >= from && isOpen(t))
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())[0] ?? null;
}

/** Org-wide: the day as three figures instead of forty-seven rows. */
export function figuresFor(others: Task[], isOpen: (t: Task) => boolean): { open: number; urgent: number; unassigned: number; sites: number } {
  const open = others.filter(isOpen);
  return {
    open: open.length,
    urgent: open.filter((t) => t.priority === 'URGENT').length,
    unassigned: open.filter((t) => !t.assignedToId).length,
    sites: new Set(open.map((t) => (t as unknown as { spaceId?: string | null }).spaceId ?? '—')).size,
  };
}

/**
 * Today's own work: what is due today, PLUS what is already in your hands
 * whatever its date says — under way, blocked, or overdue.
 *
 * ⚠️ A JOB YOU ARE ON DOES NOT LEAVE BECAUSE ITS DATE PASSED. "On the way" to
 * a visit due sixteen days ago dropped out of Today entirely (01.png), while
 * the Jobs tab put it first as "Next up". Both now order by `rankMyWork` — the
 * shared answer to "what do I do next" — so they cannot disagree.
 */
export function todaysOwn(mine: Task[], today: Date, isOpen: (t: Task) => boolean, now: Date = new Date()): Task[] {
  const due = new Set(tasksOn(mine, today).map((t) => t.id));
  const carried = mine.filter((t) => {
    if (due.has(t.id) || !isOpen(t)) return false;
    const band = workBand(t as never, now);
    return band === 'doing' || band === 'blocked' || band === 'overdue';
  });
  /*
    ⚠️ CARRIED WORK FIRST, BY THE SHARED RANKING; THEN TODAY BY THE CLOCK. A
    day read by priority went 12:00, 10:00, 11:00, 14:00 — a list of a day is
    read top to bottom as the day goes.
  */
  const first = rankMyWork(carried as never[], now) as unknown as Task[];
  const today_ = tasksOn(mine, today).filter((t) => !first.includes(t));
  const ranked = rankMyWork(today_ as never[], now) as unknown as Task[];
  const underWay = ranked.filter((t) => ['doing', 'blocked'].includes(workBand(t as never, now)));
  return [...first, ...underWay, ...today_.filter((t) => !underWay.includes(t))];
}

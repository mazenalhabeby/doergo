import {
  isTaskAssignee,
  getFlowSteps,
  getStartOfDay,
  workflowStatusLabel,
  type FlowStatus,
} from '@hbcfield/shared/client';
import type { ScheduleEntry, Task } from '../../lib/api/types';

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

/**
 * Local midnight of the FOLLOWING day.
 *
 * ⚠️ NOT `startOfDay(d) + 86_400_000`. A local day is 23 or 25 hours on the
 * two DST Sundays (Vienna: last Sunday of March and of October), so adding
 * 24h put a 23:30 job on 25 October on NO day at all, and a 00:30 job on
 * 30 March on two.
 */
export function nextDayStart(d: Date): Date {
  const n = startOfDay(d);
  n.setDate(n.getDate() + 1);
  return startOfDay(n);
}

/** How long until the calendar day turns, so a card left open at 23:59 is not showing yesterday at 00:01. */
export function msUntilNextDay(now: Date = new Date()): number {
  return Math.max(0, nextDayStart(now).getTime() - now.getTime());
}

export function tasksOn(tasks: Task[], day: Date): Task[] {
  const from = startOfDay(day).getTime();
  const to = nextDayStart(day).getTime();
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

/**
 * Was this job called off?
 *
 * ⚠️ A CANCELED JOB IS NOT "DONE". `isClosed` is right to treat it as over,
 * but the card drew every over job as a struck-through row captioned "done" —
 * so a visit the office called off read as a visit somebody completed, and
 * still counted as a dot and in "All N". Canceled work is dropped from the
 * card; finished work stays, struck through, because a list that silently
 * removes what you just completed leaves somebody wondering whether it saved.
 */
export function isCanceled(task: Task, steps: FlowStatus[] | null): boolean {
  const s = steps?.find((x) => x.key === task.status);
  if (s) return s.isCanceled;
  return task.status === 'CANCELED';
}

/**
 * Is this job under way on its OWN workflow?
 *
 * ⚠️ The shared `workBand` knows only the built-in steps (ACCEPTED, EN_ROUTE,
 * ARRIVED, IN_PROGRESS, WORKING). A custom flow — New → In Transit → Delivered
 * — has none of them, so a job somebody was in the middle of was "upcoming",
 * and an undated one appeared nowhere on the card. Read from the flow instead:
 * a step that is not where the flow starts, not a waiting step, and not over.
 */
export const WAITING = new Set(['DRAFT', 'NEW', 'OPEN', 'TODO', 'PENDING', 'ASSIGNED', 'BACKLOG', 'SCHEDULED', 'BLOCKED']);

export function isUnderWay(task: Task, steps: FlowStatus[] | null): boolean {
  if (!steps?.length || WAITING.has(task.status)) return false;
  const s = steps.find((x) => x.key === task.status);
  if (!s || s.isFinal || s.isCanceled) return false;
  const first = Math.min(...steps.map((x) => x.position ?? 0));
  return (s.position ?? 0) > first;
}

/** The rows the card draws from: everything in hand except what was called off. */
export function withoutCanceled(tasks: Task[], flows: Map<string, unknown>): Task[] {
  return tasks.filter((t) => !isCanceled(t, stepsFor(t, flows)));
}

export type Translate = (key: string, opts: { defaultValue: string }) => string;

/**
 * The step a job is on, in the reader's language where the words are ours.
 *
 * ⚠️ `FlowStatus.label` IS THE ENGLISH NAME a shipped template was created
 * with. A German member read "EN ROUTE" on the card while the rest of the
 * screen was German. Resolution, most specific first:
 *   1. the workflow's own status row — a person-written name (no `nameKey`)
 *      is shown exactly as written; a shipped one goes through its key
 *   2. the product's own word for a canonical status (`status.EN_ROUTE`)
 *   3. the raw key, readable, never blank
 */
export function stepLabelFor(task: Task, flows: Map<string, unknown>, t: Translate): string {
  const canonical = (fallback: string) => t(`status.${task.status}`, { defaultValue: fallback });
  const id = flowIdOf(task);
  const raw = id ? (flows.get(id) as { statuses?: Array<{ key?: string; name?: string; label?: string; nameKey?: string | null }> } | undefined) : undefined;
  const row = raw?.statuses?.find((s) => s.key === task.status);
  if (row) {
    const name = row.name ?? row.label ?? task.status;
    if (!row.nameKey) return name;
    return workflowStatusLabel({ name, nameKey: row.nameKey }, (key, o) => t(key, { defaultValue: canonical(o.defaultValue) }));
  }
  const step = stepsFor(task, flows)?.find((x) => x.key === task.status);
  // The built-in flow is shipped English — ours to translate.
  return canonical(step?.label ?? task.status.replace(/_/g, ' '));
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
  const from = nextDayStart(day).getTime();
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

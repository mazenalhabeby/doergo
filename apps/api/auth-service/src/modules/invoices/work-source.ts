/**
 * What counts as billable work, and when — ONE answer for the client invoice
 * and the worker's statement.
 *
 * ⚠️ The statement must show the same hours as the invoice built from the same
 * jobs ("same hours, different rate"). Two copies of "which jobs are in the
 * period" and "how long did this one take" is how the two documents quietly
 * stop agreeing — the first person to notice is holding both.
 */

/**
 * `YYYY-MM-DD` → the first and last instant of that day.
 *
 * ⚠️ Both ends INCLUSIVE, and the `to` end is pushed to 23:59:59.999. A
 * half-open range silently drops everything finished on the last day of the
 * month, which is the single most common day to close a job before billing it.
 */
export function dayStart(iso?: string | null): Date | null {
  return iso ? new Date(`${iso}T00:00:00.000Z`) : null;
}
export function dayEnd(iso?: string | null): Date | null {
  return iso ? new Date(`${iso}T23:59:59.999Z`) : null;
}

/**
 * Jobs in a service period, by when the WORK was done.
 *
 * ⚠️ That is the report's `completedAt` where there is a report, and
 * `updatedAt` only as a fallback for a job closed without one — an OR over two
 * columns rather than a filter on one. A filter on `updatedAt` alone would move
 * a job into another month because somebody edited its title.
 */
export function jobsInPeriod(from?: string | null, to?: string | null): Record<string, unknown> {
  const gte = dayStart(from);
  const lte = dayEnd(to);
  if (!gte && !lte) return {};
  const range = { ...(gte && { gte }), ...(lte && { lte }) };
  return { OR: [{ serviceReport: { completedAt: range } }, { serviceReport: null, updatedAt: range }] };
}

/** Finished work only. */
export const FINISHED = { in: ['COMPLETED', 'CLOSED'] };

/** A job's hours: the report's recorded duration, two decimals; none without a report. */
export function jobHours(report: { workDuration: number } | null | undefined): number {
  return report && report.workDuration > 0 ? Math.round((report.workDuration / 3600) * 100) / 100 : 0;
}

/** A clock-in, with whatever counted time it carries. */
export interface CountedClockIn {
  userId: string;
  clockInAt: Date;
  clockOutAt?: Date | null;
  paidMinutes?: number | null;
  totalMinutes?: number | null;
}

/** A finished job, as a mark on a day with its own duration. */
export interface CountedJob {
  userId: string | null;
  at: Date;
  minutes: number;
}

/**
 * Counted minutes per person per day — ONE rule for the invoice margin and the
 * worker's statement.
 *
 * ⚠️ A person's time on a day is the counted time of their clock-ins that day.
 * A day with no clock-in but a finished job counts that job's time instead.
 * Never both: a job done during a clocked shift is already inside the shift.
 *
 * Keyed `userId|YYYY-MM-DD`, the day read by `dayOf` (the workspace's zone).
 */
export function countedMinutesByDay(
  clockIns: CountedClockIn[],
  jobs: CountedJob[],
  dayOf: (at: Date) => string,
): Map<string, number> {
  const out = new Map<string, number>();
  const add = (k: string, m: number) => out.set(k, (out.get(k) ?? 0) + m);
  for (const e of clockIns) {
    const m =
      e.paidMinutes ?? e.totalMinutes ??
      (e.clockOutAt ? Math.max(0, Math.round((e.clockOutAt.getTime() - e.clockInAt.getTime()) / 60000)) : 0);
    add(`${e.userId}|${dayOf(e.clockInAt)}`, m);
  }
  const clocked = new Set(out.keys());
  for (const j of jobs) {
    if (!j.userId) continue;
    const k = `${j.userId}|${dayOf(j.at)}`;
    if (!clocked.has(k)) add(k, Math.max(0, j.minutes));
  }
  return out;
}

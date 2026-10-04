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

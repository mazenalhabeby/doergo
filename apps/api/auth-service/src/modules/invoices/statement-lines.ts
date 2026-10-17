import { dayKeyIn, zoneOf, workedDays, type RateBook, type RateLevel } from '@hbcfield/shared';
import { jobHours } from './work-source';

/** The lines of a worker's statement (`StatementService.forMember`), step by step. */

/** One workspace's hours at one rate, on the statement. */
export interface StatementLine {
  spaceId: string | null;
  spaceName: string | null;
  hours: number;
  /** Cents per hour — the rate with us on the days the work was done. Null = no rate set. */
  rateCents: number | null;
  /** Which level the rate came from: this client, the member, the client, the organization. */
  rateLevel: RateLevel | null;
  amountCents: number;
  jobs: number;
  /** First and last day of work in this line, `YYYY-MM-DD`. */
  fromDay: string;
  toDay: string;
  /**
   * `hours` = job hours × hourly rate with us. `days` = days worked × day rate
   * with us; its `hours` is the counted time on those days, shown, not priced.
   */
  basis: 'hours' | 'days';
  /** `days` lines: how many days the run covers. */
  days?: number;
}

/** A job as the statement reads it (the select in `StatementService.workOf`). */
export interface StatementTask {
  id: string;
  updatedAt: Date;
  spaceId: string | null;
  space: { id: string; name: string; timezone: string | null; costRateCents: number | null } | null;
  serviceReport: { workDuration: number; completedAt: Date } | null;
}

export type CostOn = (spaceId: string | null, day: string) => { cents: number | null; level: RateLevel | null };

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** The moment a job counts on: the report's completion, else the row's last change. */
const doneAt = (t: StatementTask) => t.serviceReport?.completedAt ?? t.updatedAt;

/** Time entries a day either side of the period, so a zone's local day is never cut. */
export function clockInWindow(from: string | null, to: string | null) {
  return from || to
    ? {
        clockInAt: {
          ...(from && { gte: new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000) }),
          ...(to && { lte: new Date(Date.parse(`${to}T23:59:59.999Z`) + 86_400_000) }),
        },
      }
    : {};
}

/**
 * HOURS rows in one workspace — the time ON SITE, like the workspace invoice:
 * counted clock-in time per day (a job's time on a day with no clock-in), at the
 * hourly rate with us in force each day, split where that rate changed.
 */
export function hoursRunsIn(
  sid: string,
  ctx: {
    memberId: string;
    days: string[];
    minutes: Map<string, number>;
    spaceName: string | null;
    tz: string;
    tasks: StatementTask[];
    costOn: CostOn;
  },
): StatementLine[] {
  const runs: StatementLine[] = [];
  for (const d of ctx.days) {
    const m = ctx.minutes.get(`${ctx.memberId}|${d}`) ?? 0;
    if (m <= 0) continue;
    const resolved = ctx.costOn(sid, d);
    const last = runs[runs.length - 1];
    if (last && last.rateCents === resolved.cents) {
      last.hours = round2(last.hours + m / 60);
      last.days = (last.days ?? 0) + 1;
      last.toDay = d;
    } else {
      runs.push({
        spaceId: sid,
        spaceName: ctx.spaceName,
        hours: round2(m / 60),
        rateCents: resolved.cents,
        rateLevel: resolved.level,
        amountCents: 0,
        jobs: 0,
        fromDay: d,
        toDay: d,
        basis: 'hours',
        days: 1,
      });
    }
  }
  for (const r of runs) {
    r.jobs = ctx.tasks.filter(
      (t) => t.spaceId === sid && r.fromDay <= dayKeyIn(doneAt(t), ctx.tz) && dayKeyIn(doneAt(t), ctx.tz) <= r.toDay,
    ).length;
  }
  return runs;
}

/** Jobs with no workspace keep their own hours — one line per rate. */
export function unplacedJobLines(tasks: StatementTask[], tz: string, costOn: CostOn): StatementLine[] {
  const buckets = new Map<string, StatementLine>();
  for (const t of tasks) {
    if (t.spaceId) continue;
    const hours = jobHours(t.serviceReport);
    if (hours <= 0) continue;
    const day = dayKeyIn(doneAt(t), tz);
    const resolved = costOn(null, day);
    const key = `none|${resolved.cents ?? 'none'}`;
    const line = buckets.get(key) ?? {
      spaceId: null,
      spaceName: null,
      hours: 0,
      rateCents: resolved.cents,
      rateLevel: resolved.level,
      amountCents: 0,
      jobs: 0,
      fromDay: day,
      toDay: day,
      basis: 'hours' as const,
    };
    line.hours = round2(line.hours + hours);
    line.jobs += 1;
    if (day < line.fromDay) line.fromDay = day;
    if (day > line.toDay) line.toDay = day;
    buckets.set(key, line);
  }
  return [...buckets.values()];
}

/** DAYS rows in one workspace: every day worked there × their day rate with you, in runs at one rate. */
export function dayRunsIn(
  sid: string,
  ctx: {
    memberId: string;
    days: string[];
    minutes: Map<string, number>;
    spaceName: string | null;
    tz: string;
    jobsHere: StatementTask[];
    book: RateBook;
    assignmentId: string | null;
  },
): StatementLine[] {
  const dayOf = (at: Date) => dayKeyIn(at, ctx.tz);
  // One entry per day, then consecutive days at the same day rate become one line.
  const runs: Array<StatementLine & { minutes: number }> = [];
  for (const d of ctx.days) {
    const dayCost = ctx.book.personDayCostOn(d, ctx.memberId, ctx.assignmentId);
    const m = ctx.minutes.get(`${ctx.memberId}|${d}`) ?? 0;
    const jobsThatDay = ctx.jobsHere.filter((t) => dayOf(doneAt(t)) === d).length;
    const last = runs[runs.length - 1];
    if (last && last.rateCents === dayCost) {
      last.minutes += m;
      last.days = (last.days ?? 0) + 1;
      last.jobs += jobsThatDay;
      last.toDay = d;
    } else {
      runs.push({
        spaceId: sid,
        spaceName: ctx.spaceName,
        hours: 0,
        rateCents: dayCost,
        rateLevel: null,
        amountCents: 0,
        jobs: jobsThatDay,
        fromDay: d,
        toDay: d,
        basis: 'days',
        days: 1,
        minutes: m,
      });
    }
  }
  return runs.map(({ minutes: m, ...l }) => ({ ...l, hours: round2(m / 60) }));
}

/*
  ⚠️ The money follows the PRINTED hours, rounded once per line — so every
  line multiplies out for whoever checks it with a calculator, the same
  promise the invoice makes.
*/
export function priceLines(lines: StatementLine[]): StatementLine[] {
  return (
    lines
      .map((l) => ({
        ...l,
        amountCents:
          l.rateCents === null
            ? 0
            : l.basis === 'days'
              ? l.rateCents * (l.days ?? 0)
              : Math.round(l.rateCents * l.hours),
      }))
      // Per workspace: hours rows, then days rows — the invoice's order.
      .sort(
        (a, b) =>
          (a.spaceName ?? '').localeCompare(b.spaceName ?? '') ||
          (a.basis === b.basis ? 0 : a.basis === 'hours' ? -1 : 1) ||
          a.fromDay.localeCompare(b.fromDay),
      )
  );
}

/** Days on site, by the invoice's rule: a day clocked in OR a day a job was finished there. */
export function daysBySpaceOf(
  clockIns: { locationId: string; clockInAt: Date; location: { timezone: string | null } | null }[],
  tasks: StatementTask[],
  orgTimezone: string | null | undefined,
  from: string | null,
  to: string | null,
): Record<string, number> {
  const daysBySpace: Record<string, number> = {};
  const tzOf = new Map<string, string>();
  for (const c of clockIns) if (c.location?.timezone) tzOf.set(c.locationId, c.location.timezone);
  for (const t of tasks) if (t.spaceId && t.space?.timezone) tzOf.set(t.spaceId, t.space.timezone);
  const sids = new Set([
    ...clockIns.map((c) => c.locationId),
    ...tasks.map((t) => t.spaceId).filter((x): x is string => !!x),
  ]);
  for (const sid of sids) {
    const tz = zoneOf(tzOf.get(sid), orgTimezone);
    const marks = [
      ...clockIns.filter((c) => c.locationId === sid),
      ...tasks.filter((t) => t.spaceId === sid).map((t) => ({ clockInAt: doneAt(t) })),
    ];
    daysBySpace[sid] = workedDays(marks, (at) => dayKeyIn(at, tz), from, to).length;
  }
  return daysBySpace;
}

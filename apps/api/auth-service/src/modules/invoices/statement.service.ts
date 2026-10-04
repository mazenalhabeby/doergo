import { Injectable, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  loadRateBook,
  dayKeyIn,
  parseDayKey,
  resolveRate,
  workedDays,
  effectiveBillBy,
  billsDays,
  billsHours,
  type BillByValue,
  type RateLevel,
} from '@hbcfield/shared';
import { FINISHED, countedMinutesByDay, jobHours, jobsInPeriod } from './work-source';

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

/**
 * A worker's statement: what their hours come to at THEIR rate with us.
 *
 * ⚠️ SAME HOURS AS THE CLIENT INVOICE, DIFFERENT RATE. The client is billed
 * Mark's $85; Mark's statement reads his $25 for the very same jobs. So the
 * jobs and their hours come from the rule the invoice uses (`work-source`), and
 * only the rate differs — the COST side of the same ladder, as it stood on the
 * day each job was done.
 *
 * ⚠️ The cost ladder, not the member's own rate alone: a contractor who costs
 * more at one site (an assignment's cost rate) is the exception the ladder
 * exists for, and a statement that ignored it would disagree with the margin
 * the invoice screen shows.
 *
 * Read-only and computed — nothing is stored. A statement re-run next month
 * for October still reads October's rates, because rates are dated.
 *
 * Three queries plus one for the dated rates, whatever the period.
 */
@Injectable()
export class StatementService {
  constructor(private readonly prisma: PrismaService) {}

  async forMember(data: { organizationId: string; memberId: string; from?: string; to?: string }) {
    const from = data.from ? parseDayKey(data.from) : null;
    const to = data.to ? parseDayKey(data.to) : null;
    if ((data.from && !from) || (data.to && !to) || (from && to && from > to)) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'The period must be two real days, the first not after the last' };
    }

    const [member, org] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: data.memberId, organizationId: data.organizationId },
        select: { id: true, firstName: true, lastName: true, isExternal: true, costRateCents: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: data.organizationId },
        select: { name: true, costRateCents: true, timezone: true },
      }),
    ]);
    // 404, not 403: whether somebody is a member here is not for an outsider to learn.
    if (!member) return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Member not found' };
    if (member.isExternal) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'An external member works for somebody else — there is no statement from us' };
    }

    // The jobs this person did, exactly as the invoice counts them.
    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId: data.organizationId,
        status: FINISHED,
        AND: [
          {
            OR: [
              // Whoever completed the report did the work; with no report, the assignee.
              { serviceReport: { completedById: member.id } },
              { serviceReport: null, assignedToId: member.id },
            ],
          },
          jobsInPeriod(from, to),
        ],
      },
      select: {
        id: true,
        updatedAt: true,
        spaceId: true,
        space: { select: { id: true, name: true, timezone: true, costRateCents: true } },
        serviceReport: { select: { workDuration: true, completedAt: true } },
      },
      orderBy: { updatedAt: 'asc' },
    });

    /*
      Every workspace this person belongs to — not only where they finished a
      job — because somebody billed by the day may have worked there all month
      and closed nothing. Their billing there decides how their time is counted.
    */
    const [assignments, clockIns] = await Promise.all([
      this.prisma.spaceAssignment.findMany({
        where: { userId: member.id, organizationId: data.organizationId },
        select: {
          id: true,
          spaceId: true,
          costRateCents: true,
          billBy: true,
          space: { select: { id: true, name: true, timezone: true, costRateCents: true } },
        },
      }),
      this.prisma.timeEntry.findMany({
        where: {
          userId: member.id,
          organizationId: data.organizationId,
          approvalStatus: { not: 'REJECTED' },
          ...(from || to
            ? { clockInAt: { ...(from && { gte: new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000) }), ...(to && { lte: new Date(Date.parse(`${to}T23:59:59.999Z`) + 86_400_000) }) } }
            : {}),
        },
        select: {
          userId: true, locationId: true, clockInAt: true, clockOutAt: true, paidMinutes: true, totalMinutes: true,
          location: { select: { timezone: true } },
        },
      }),
    ]);
    const assignmentIn = new Map(assignments.map((a) => [a.spaceId, a]));
    const spaceInfo = new Map<string, { id: string; name: string; timezone: string | null; costRateCents: number | null }>();
    for (const a of assignments) if (a.space) spaceInfo.set(a.spaceId, a.space);
    for (const t of tasks) if (t.spaceId && t.space && !spaceInfo.has(t.spaceId)) spaceInfo.set(t.spaceId, t.space);
    const spaceIds = [...spaceInfo.keys()];
    const book = await loadRateBook(this.prisma, data.organizationId, {
      organizationIds: [data.organizationId],
      spaceIds,
      memberIds: [member.id],
      assignmentIds: assignments.map((a) => a.id),
    });

    // Their cost rate on a day, in a workspace — the cost side of the ladder, dated.
    const costOn = (spaceId: string | null, day: string) => {
      const a = spaceId ? assignmentIn.get(spaceId) : undefined;
      const sp = spaceId ? spaceInfo.get(spaceId) : undefined;
      return resolveRate('cost', {
        contract: a ? { costRateCents: book.on(day, 'ASSIGNMENT', a.id, 'COST_HOUR', a.costRateCents) } : null,
        member: { costRateCents: book.on(day, 'MEMBER', member.id, 'COST_HOUR', member.costRateCents) },
        client: sp ? { costRateCents: book.on(day, 'SPACE', sp.id, 'COST_HOUR', sp.costRateCents) } : null,
        organization: { costRateCents: book.on(day, 'ORGANIZATION', data.organizationId, 'COST_HOUR', org?.costRateCents) },
      });
    };
    const tzOfSpace = (spaceId: string | null) => (spaceId && spaceInfo.get(spaceId)?.timezone) || org?.timezone || 'UTC';
    /*
      ⚠️ THE INVOICE'S SHAPE AND THE MARGIN'S RULE — two rows, like the invoice.
      Where somebody is billed by the hour (or hour + day) their jobs give an
      HOURS row at their hourly rate with you; where they are billed by the day
      (or hour + day) their days give a DAYS row at their day rate with you.
    */
    const billingIn = (spaceId: string | null): BillByValue =>
      effectiveBillBy((spaceId ? (assignmentIn.get(spaceId)?.billBy as BillByValue | null) : null) ?? null);

    const lines: StatementLine[] = [];
    let totalHours = 0;
    const round2 = (n: number) => Math.round(n * 100) / 100;

    // Counted time per day in each workspace — the invoice's own rule.
    const minutesIn = new Map<string, Map<string, number>>();
    for (const sid of spaceIds) {
      const dayOf = (at: Date) => dayKeyIn(at, tzOfSpace(sid));
      minutesIn.set(
        sid,
        countedMinutesByDay(
          clockIns.filter((c) => c.locationId === sid),
          tasks
            .filter((t) => t.spaceId === sid)
            .map((t) => ({ userId: member.id, at: t.serviceReport?.completedAt ?? t.updatedAt, minutes: Math.round((t.serviceReport?.workDuration ?? 0) / 60) })),
          dayOf,
        ),
      );
    }
    const daysIn = (sid: string) =>
      [...(minutesIn.get(sid)?.keys() ?? [])]
        .map((k) => k.split('|')[1]!)
        .filter((d) => (!from || d >= from) && (!to || d <= to))
        .sort();

    /*
      1 · HOURS rows — the time ON SITE, like the workspace invoice: counted
      clock-in time per day (a job's time on a day with no clock-in), at the
      hourly rate with us in force each day, split where that rate changed.
      Jobs with no workspace keep their own hours.
    */
    for (const sid of spaceIds.filter((x) => billsHours(billingIn(x)))) {
      const runs: StatementLine[] = [];
      for (const d of daysIn(sid)) {
        const m = minutesIn.get(sid)!.get(`${member.id}|${d}`) ?? 0;
        if (m <= 0) continue;
        const resolved = costOn(sid, d);
        const last = runs[runs.length - 1];
        if (last && last.rateCents === resolved.cents) {
          last.hours = round2(last.hours + m / 60);
          last.days = (last.days ?? 0) + 1;
          last.toDay = d;
        } else {
          runs.push({
            spaceId: sid, spaceName: spaceInfo.get(sid)?.name ?? null, hours: round2(m / 60),
            rateCents: resolved.cents, rateLevel: resolved.level, amountCents: 0,
            jobs: 0, fromDay: d, toDay: d, basis: 'hours', days: 1,
          });
        }
      }
      for (const r of runs) {
        r.jobs = tasks.filter((t) => t.spaceId === sid && r.fromDay <= dayKeyIn(t.serviceReport?.completedAt ?? t.updatedAt, tzOfSpace(sid)) && dayKeyIn(t.serviceReport?.completedAt ?? t.updatedAt, tzOfSpace(sid)) <= r.toDay).length;
      }
      lines.push(...runs);
    }
    const buckets = new Map<string, StatementLine>();
    for (const t of tasks) {
      if (t.spaceId) continue;
      const hours = jobHours(t.serviceReport);
      if (hours <= 0) continue;
      const day = dayKeyIn(t.serviceReport?.completedAt ?? t.updatedAt, tzOfSpace(null));
      const resolved = costOn(null, day);
      const key = `none|${resolved.cents ?? 'none'}`;
      const line = buckets.get(key) ?? {
        spaceId: null, spaceName: null, hours: 0, rateCents: resolved.cents, rateLevel: resolved.level,
        amountCents: 0, jobs: 0, fromDay: day, toDay: day, basis: 'hours' as const,
      };
      line.hours = round2(line.hours + hours);
      line.jobs += 1;
      if (day < line.fromDay) line.fromDay = day;
      if (day > line.toDay) line.toDay = day;
      buckets.set(key, line);
    }
    lines.push(...buckets.values());

    // 2 · Days rows: every day worked there × their day rate with you, in runs at one rate.
    for (const sid of spaceIds.filter((x) => billsDays(billingIn(x)))) {
      const dayOf = (at: Date) => dayKeyIn(at, tzOfSpace(sid));
      const jobsHere = tasks.filter((t) => t.spaceId === sid);
      const minutes = minutesIn.get(sid)!;
      const days = daysIn(sid);
      // One entry per day, then consecutive days at the same day rate become one line.
      const assignmentId = assignmentIn.get(sid)?.id ?? null;
      const runs: Array<StatementLine & { minutes: number }> = [];
      for (const d of days) {
        const dayCost = book.personDayCostOn(d, member.id, assignmentId);
        const m = minutes.get(`${member.id}|${d}`) ?? 0;
        const jobsThatDay = jobsHere.filter((t) => dayOf(t.serviceReport?.completedAt ?? t.updatedAt) === d).length;
        const last = runs[runs.length - 1];
        if (last && last.rateCents === dayCost) {
          last.minutes += m;
          last.days = (last.days ?? 0) + 1;
          last.jobs += jobsThatDay;
          last.toDay = d;
        } else {
          runs.push({
            spaceId: sid, spaceName: spaceInfo.get(sid)?.name ?? null, hours: 0,
            rateCents: dayCost, rateLevel: null, amountCents: 0, jobs: jobsThatDay,
            fromDay: d, toDay: d, basis: 'days', days: 1, minutes: m,
          });
        }
      }
      for (const { minutes: m, ...l } of runs) lines.push({ ...l, hours: round2(m / 60) });
    }

    /*
      ⚠️ The money follows the PRINTED hours, rounded once per line — so every
      line multiplies out for whoever checks it with a calculator, the same
      promise the invoice makes.
    */
    const priced = lines
      .map((l) => ({
        ...l,
        amountCents:
          l.rateCents === null ? 0 : l.basis === 'days' ? l.rateCents * (l.days ?? 0) : Math.round(l.rateCents * l.hours),
      }))
      // Per workspace: hours rows, then days rows — the invoice's order.
      .sort(
        (a, b) =>
          (a.spaceName ?? '').localeCompare(b.spaceName ?? '') ||
          (a.basis === b.basis ? 0 : a.basis === 'hours' ? -1 : 1) ||
          a.fromDay.localeCompare(b.fromDay),
      );
    // Hours priced on the statement — a days row's hours are information, not paid hours.
    totalHours = priced.reduce((s2, l) => s2 + (l.basis === 'hours' ? l.hours : 0), 0);

    // Days on site, by the invoice's rule: a day clocked in OR a day a job was finished there.
    const daysBySpace: Record<string, number> = {};
    const tzOf = new Map<string, string>();
    for (const c of clockIns) if (c.location?.timezone) tzOf.set(c.locationId, c.location.timezone);
    for (const t of tasks) if (t.spaceId && t.space?.timezone) tzOf.set(t.spaceId, t.space.timezone);
    const sids = new Set([...clockIns.map((c) => c.locationId), ...tasks.map((t) => t.spaceId).filter((x): x is string => !!x)]);
    for (const sid of sids) {
      const tz = tzOf.get(sid) || org?.timezone || 'UTC';
      const marks = [
        ...clockIns.filter((c) => c.locationId === sid),
        ...tasks.filter((t) => t.spaceId === sid).map((t) => ({ clockInAt: t.serviceReport?.completedAt ?? t.updatedAt })),
      ];
      daysBySpace[sid] = workedDays(marks, (at) => dayKeyIn(at, tz), from, to).length;
    }

    return {
      success: true,
      data: {
        member: { id: member.id, name: `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() },
        organizationName: org?.name ?? null,
        from,
        to,
        currency: 'EUR',
        lines: priced,
        daysBySpace,
        totalHours: round2(totalHours),
        totalCents: priced.reduce((sum, l) => sum + l.amountCents, 0),
        /** Lines with hours and no rate anywhere on the ladder — worth saying, never a silent zero. */
        missingRate: priced.some((l) => l.rateCents === null),
      },
    };
  }
}

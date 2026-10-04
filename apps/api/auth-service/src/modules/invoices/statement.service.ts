import { Injectable, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  loadRateBook,
  dayKeyIn,
  parseDayKey,
  resolveRate,
  workedDays,
  type RateLevel,
} from '@hbcfield/shared';
import { FINISHED, jobHours, jobsInPeriod } from './work-source';

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

    const spaceIds = [...new Set(tasks.map((t) => t.spaceId).filter((x): x is string => !!x))];
    const [assignments, clockIns] = await Promise.all([
      spaceIds.length
        ? this.prisma.spaceAssignment.findMany({
            where: { userId: member.id, spaceId: { in: spaceIds } },
            select: { id: true, spaceId: true, costRateCents: true },
          })
        : Promise.resolve([]),
      // Days on site, for the reader's reference — the statement is hourly.
      this.prisma.timeEntry.findMany({
        where: {
          userId: member.id,
          organizationId: data.organizationId,
          approvalStatus: { not: 'REJECTED' },
          ...(from || to
            ? { clockInAt: { ...(from && { gte: new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000) }), ...(to && { lte: new Date(Date.parse(`${to}T23:59:59.999Z`) + 86_400_000) }) } }
            : {}),
        },
        select: { locationId: true, clockInAt: true, location: { select: { timezone: true } } },
      }),
    ]);
    const assignmentIn = new Map(assignments.map((a) => [a.spaceId, a]));
    const book = await loadRateBook(this.prisma, data.organizationId, {
      organizationIds: [data.organizationId],
      spaceIds,
      memberIds: [member.id],
      assignmentIds: assignments.map((a) => a.id),
    });

    // Price each job on its own day, then gather by (workspace, rate).
    const buckets = new Map<string, StatementLine>();
    let totalHours = 0;
    for (const t of tasks) {
      const hours = jobHours(t.serviceReport);
      if (hours <= 0) continue;
      const tz = t.space?.timezone || org?.timezone || 'UTC';
      const day = dayKeyIn(t.serviceReport?.completedAt ?? t.updatedAt, tz);
      const a = t.spaceId ? assignmentIn.get(t.spaceId) : undefined;
      const resolved = resolveRate('cost', {
        contract: a ? { costRateCents: book.on(day, 'ASSIGNMENT', a.id, 'COST_HOUR', a.costRateCents) } : null,
        member: { costRateCents: book.on(day, 'MEMBER', member.id, 'COST_HOUR', member.costRateCents) },
        client: t.space ? { costRateCents: book.on(day, 'SPACE', t.space.id, 'COST_HOUR', t.space.costRateCents) } : null,
        organization: { costRateCents: book.on(day, 'ORGANIZATION', data.organizationId, 'COST_HOUR', org?.costRateCents) },
      });
      const key = `${t.spaceId ?? ''}|${resolved.cents ?? 'none'}`;
      const line = buckets.get(key) ?? {
        spaceId: t.spaceId,
        spaceName: t.space?.name ?? null,
        hours: 0,
        rateCents: resolved.cents,
        rateLevel: resolved.level,
        amountCents: 0,
        jobs: 0,
        fromDay: day,
        toDay: day,
      };
      line.hours = Math.round((line.hours + hours) * 100) / 100;
      line.jobs += 1;
      if (day < line.fromDay) line.fromDay = day;
      if (day > line.toDay) line.toDay = day;
      buckets.set(key, line);
      totalHours += hours;
    }
    /*
      ⚠️ The money follows the PRINTED hours, rounded once per line — so every
      line multiplies out for whoever checks it with a calculator, the same
      promise the invoice makes.
    */
    const lines = [...buckets.values()]
      .map((l) => ({ ...l, amountCents: l.rateCents === null ? 0 : Math.round(l.rateCents * l.hours) }))
      .sort((a, b) => (a.spaceName ?? '').localeCompare(b.spaceName ?? '') || a.fromDay.localeCompare(b.fromDay));

    const daysBySpace: Record<string, number> = {};
    for (const sid of new Set(clockIns.map((c) => c.locationId))) {
      const entries = clockIns.filter((c) => c.locationId === sid);
      const tz = entries[0]?.location?.timezone || org?.timezone || 'UTC';
      daysBySpace[sid] = workedDays(entries, (at) => dayKeyIn(at, tz), from, to).length;
    }

    return {
      success: true,
      data: {
        member: { id: member.id, name: `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() },
        organizationName: org?.name ?? null,
        from,
        to,
        currency: 'EUR',
        lines,
        daysBySpace,
        totalHours: Math.round(totalHours * 100) / 100,
        totalCents: lines.reduce((s, l) => s + l.amountCents, 0),
        /** Lines with hours and no rate anywhere on the ladder — worth saying, never a silent zero. */
        missingRate: lines.some((l) => l.rateCents === null),
      },
    };
  }
}

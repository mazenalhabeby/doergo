import type { Prisma } from '@prisma/client';
import { Injectable, HttpStatus } from '@nestjs/common';
import { PrismaService, memberClockIns, memberTermsForStatement, memberFinishedJobs } from '@hbcfield/shared';
import {
  personName,
  zoneOf,
  loadRateBook,
  dayKeyIn,
  parseDayKey,
  resolveRate,
  effectiveBillBy,
  billsDays,
  billsHours,
  type BillByValue,
  currencyOrNull,
  DEFAULT_CURRENCY,
} from '@hbcfield/shared';
import { FINISHED, countedMinutesByDay, jobsInPeriod } from './work-source';
import {
  clockInWindow,
  dayRunsIn,
  daysBySpaceOf,
  hoursRunsIn,
  priceLines,
  round2,
  unplacedJobLines,
  type StatementLine,
} from './statement-lines';

export type { StatementLine } from './statement-lines';

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
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'The period must be two real days, the first not after the last',
      };
    }

    const [member, org] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: data.memberId, organizationId: data.organizationId },
        select: { id: true, firstName: true, lastName: true, isExternal: true, costRateCents: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: data.organizationId },
        select: { name: true, costRateCents: true, timezone: true, currency: true },
      }),
    ]);
    // 404, not 403: whether somebody is a member here is not for an outsider to learn.
    if (!member) return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Member not found' };
    if (member.isExternal) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'An external member works for somebody else — there is no statement from us',
      };
    }

    const { tasks, assignments, clockIns } = await this.workOf(data.organizationId, member.id, from, to);
    const assignmentIn = new Map(assignments.map((a) => [a.spaceId, a]));
    const spaceInfo = new Map<
      string,
      { id: string; name: string; timezone: string | null; costRateCents: number | null }
    >();
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
        organization: {
          costRateCents: book.on(day, 'ORGANIZATION', data.organizationId, 'COST_HOUR', org?.costRateCents),
        },
      });
    };
    const tzOfSpace = (spaceId: string | null) =>
      zoneOf(spaceId ? spaceInfo.get(spaceId)?.timezone : null, org?.timezone);
    /*
      ⚠️ THE INVOICE'S SHAPE AND THE MARGIN'S RULE — two rows, like the invoice.
      Where somebody is billed by the hour (or hour + day) their jobs give an
      HOURS row at their hourly rate with you; where they are billed by the day
      (or hour + day) their days give a DAYS row at their day rate with you.
    */
    const billingIn = (spaceId: string | null): BillByValue =>
      effectiveBillBy((spaceId ? (assignmentIn.get(spaceId)?.billBy as BillByValue | null) : null) ?? null);

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
            .map((t) => ({
              userId: member.id,
              at: t.serviceReport?.completedAt ?? t.updatedAt,
              minutes: Math.round((t.serviceReport?.workDuration ?? 0) / 60),
            })),
          dayOf,
        ),
      );
    }
    const daysIn = (sid: string) =>
      [...(minutesIn.get(sid)?.keys() ?? [])]
        .map((k) => k.split('|')[1]!)
        .filter((d) => (!from || d >= from) && (!to || d <= to))
        .sort();
    const placeOf = (sid: string) => ({
      memberId: member.id,
      days: daysIn(sid),
      minutes: minutesIn.get(sid)!,
      spaceName: spaceInfo.get(sid)?.name ?? null,
      tz: tzOfSpace(sid),
    });

    const lines: StatementLine[] = [];
    // 1 · HOURS rows — the time on site; jobs with no workspace keep their own hours.
    for (const sid of spaceIds.filter((x) => billsHours(billingIn(x)))) {
      lines.push(...hoursRunsIn(sid, { ...placeOf(sid), tasks, costOn }));
    }
    lines.push(...unplacedJobLines(tasks, tzOfSpace(null), costOn));
    // 2 · Days rows: every day worked there × their day rate with you, in runs at one rate.
    for (const sid of spaceIds.filter((x) => billsDays(billingIn(x)))) {
      const jobsHere = tasks.filter((t) => t.spaceId === sid);
      lines.push(
        ...dayRunsIn(sid, { ...placeOf(sid), jobsHere, book, assignmentId: assignmentIn.get(sid)?.id ?? null }),
      );
    }

    const priced = priceLines(lines);
    // Hours priced on the statement — a days row's hours are information, not paid hours.
    const totalHours = priced.reduce((s2, l) => s2 + (l.basis === 'hours' ? l.hours : 0), 0);

    return {
      success: true,
      data: {
        member: { id: member.id, name: personName(member) },
        organizationName: org?.name ?? null,
        from,
        to,
        // What a worker is paid in: the organization's currency, never a workspace's.
        currency: currencyOrNull(org?.currency) ?? DEFAULT_CURRENCY,
        lines: priced,
        daysBySpace: daysBySpaceOf(clockIns, tasks, org?.timezone, from, to),
        totalHours: round2(totalHours),
        totalCents: priced.reduce((sum, l) => sum + l.amountCents, 0),
        /** Lines with hours and no rate anywhere on the ladder — worth saying, never a silent zero. */
        missingRate: priced.some((l) => l.rateCents === null),
      },
    };
  }

  /** The jobs this person did (exactly as the invoice counts them), where they work, and their clock-ins. */
  private async workOf(organizationId: string, memberId: string, from: string | null, to: string | null) {
    const tasks = await memberFinishedJobs(this.prisma, {
      organizationId,
      memberId,
      period: jobsInPeriod(from, to) as Prisma.TaskWhereInput,
    });

    /*
      Every workspace this person belongs to — not only where they finished a
      job — because somebody billed by the day may have worked there all month
      and closed nothing. Their billing there decides how their time is counted.
    */
    const [assignments, clockIns] = await Promise.all([
      memberTermsForStatement(this.prisma, memberId, organizationId),
      memberClockIns(this.prisma, { organizationId, memberId, window: clockInWindow(from, to) }),
    ]);
    return { tasks, assignments, clockIns };
  }
}

import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '@hbcfield/shared';
import { DAY, MAX_PERIOD_DAYS, RoundRow } from './overtime-record-helpers';

/**
 * What the overtime record reads share: a round as a row, its facts, the latest
 * round per shift, and the period asked for.
 */

/** One round as a row of the history list. */
function roundRow(r: RoundRow, latest: Map<string, number>) {
  const facts = roundFacts(r, latest);
  return {
    id: r.id,
    cycle: r.cycle,
    status: r.status,
    superseded: facts.superseded,
    technician: r.technician,
    location: r.location,
    timeEntryId: r.timeEntryId,
    timeEntry: r.timeEntry,
    createdAt: r.createdAt,
    technicianRespondedAt: r.technicianRespondedAt,
    technicianReason: r.technicianReason,
    approvalMethod: r.approvalMethod,
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt,
    leaderName: r.leaderName,
    approverNotes: r.approverNotes,
    rejectionReason: r.rejectionReason,
    maxDurationMinutes: r.maxDurationMinutes,
    overtimeStartAt: r.overtimeStartAt,
    overtimeEndAt: r.overtimeEndAt,
    actualEndAt: r.actualEndAt,
    overtimeMinutes: r.overtimeMinutes,
  };
}

/** What the shared round rules read of one round. */
function roundFacts(r: RoundRow, latest: Map<string, number>) {
  return {
    status: r.status,
    maxDurationMinutes: r.maxDurationMinutes,
    overtimeStartAt: r.overtimeStartAt,
    overtimeEndAt: r.overtimeEndAt,
    actualEndAt: r.actualEndAt,
    overtimeMinutes: r.overtimeMinutes,
    clockOutAt: r.timeEntry?.clockOutAt ?? null,
    toleranceMin: r.timeEntry?.shift?.flagToleranceMin ?? null,
    superseded: (latest.get(r.timeEntryId) ?? r.cycle) > r.cycle,
  };
}

/** The newest round per shift — one query. */
async function latestCycles(prisma: PrismaService, entryIds: string[]) {
  const ids = [...new Set(entryIds)];
  if (!ids.length) return new Map<string, number>();
  const rows = await prisma.overtimeRequest.groupBy({
    by: ['timeEntryId'],
    where: { timeEntryId: { in: ids } },
    _max: { cycle: true },
  });
  return new Map(rows.map((g) => [g.timeEntryId, g._max.cycle ?? 1]));
}

/** The `createdAt` filter for a period; nothing when it is optional and not asked for. */
function createdWindow(from?: string, to?: string, required = true) {
  if (!from && !to && !required) return {};
  const p = overtimePeriod(from, to);
  return { createdAt: { gte: p.from, lt: p.to } };
}

/** `from`/`to` as instants (the page sends the local week's edges); default: the last 7 days. */
function overtimePeriod(from?: string, to?: string) {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 7 * DAY);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new BadRequestException({ code: 'OVERTIME_PERIOD_INVALID', message: 'The period is not valid.' });
  }
  if (end.getTime() - start.getTime() > MAX_PERIOD_DAYS * DAY) {
    throw new BadRequestException({
      code: 'OVERTIME_PERIOD_TOO_LONG',
      message: `A period is at most ${MAX_PERIOD_DAYS} days.`,
    });
  }
  return { from: start, to: end };
}

export { roundRow, roundFacts, latestCycles, createdWindow, overtimePeriod };

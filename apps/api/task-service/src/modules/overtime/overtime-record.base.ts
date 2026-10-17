import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DAY, MAX_PERIOD_DAYS, RoundRow } from './overtime-record-helpers';

/**
 * What the overtime record reads share: a round as a row, its facts, the latest
 * round per shift, and the period asked for.
 */
@Injectable()
export abstract class OvertimeRecordBase {

  constructor(protected readonly prisma: PrismaService) {}


  /* ------------------------------------------------------------ helpers */

  protected row(r: RoundRow, latest: Map<string, number>) {
    const facts = this.facts(r, latest);
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

  protected facts(r: RoundRow, latest: Map<string, number>) {
    return {
      status: r.status,
      maxDurationMinutes: r.maxDurationMinutes,
      overtimeStartAt: r.overtimeStartAt,
      overtimeEndAt: r.overtimeEndAt,
      actualEndAt: r.actualEndAt,
      overtimeMinutes: r.overtimeMinutes,
      clockOutAt: r.timeEntry?.clockOutAt ?? null,
      superseded: (latest.get(r.timeEntryId) ?? r.cycle) > r.cycle,
    };
  }

  /** The newest round per shift — one query. */
  protected async latestCycles(entryIds: string[]) {
    const ids = [...new Set(entryIds)];
    if (!ids.length) return new Map<string, number>();
    const rows = await this.prisma.overtimeRequest.groupBy({ by: ['timeEntryId'], where: { timeEntryId: { in: ids } }, _max: { cycle: true } });
    return new Map(rows.map((g) => [g.timeEntryId, g._max.cycle ?? 1]));
  }

  protected window(from?: string, to?: string, required = true) {
    if (!from && !to && !required) return {};
    const p = this.period(from, to);
    return { createdAt: { gte: p.from, lt: p.to } };
  }

  /** `from`/`to` as instants (the page sends the local week's edges); default: the last 7 days. */
  protected period(from?: string, to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 7 * DAY);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException({ code: 'OVERTIME_PERIOD_INVALID', message: 'The period is not valid.' });
    }
    if (end.getTime() - start.getTime() > MAX_PERIOD_DAYS * DAY) {
      throw new BadRequestException({ code: 'OVERTIME_PERIOD_TOO_LONG', message: `A period is at most ${MAX_PERIOD_DAYS} days.` });
    }
    return { from: start, to: end };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  clampListLimit,
  clampListPage,
  localPartsIn,
  overtimeRoundMinutes,
  paginated,
  safeSignatureDataUrl,
  scopeWhere,
  success,
  type OvertimePersonRow,
  type OvertimeRunningRound,
  type OvertimeSummary,
  type SpaceScopeIds,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

const DAY = 86_400_000;
/** A period is at most this long — the page offers a week or a month. */
const MAX_PERIOD_DAYS = 93;
/** Rounds read for one summary; a period with more is summarised from the newest. */
const SUMMARY_CAP = 5000;

const PERSON = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } as const;

/**
 * The Overtime page's reads (shared attendance/overtime-round.ts):
 *
 *  - `history` — every round, newest first, with what a row says in words:
 *    the reason, who decided and how, the shift it sat on, and whether a
 *    later round took over. Never the signature (it is a picture; a list of
 *    fifteen would carry fifteen).
 *  - `summary` — the period's numbers, who is running now, and per person.
 *  - `round` — one round in full, its shift's other rounds and the signature.
 *
 * All three narrow on the round's own workspace (`locationId`) with the
 * caller's scope; a round outside it reads as not found.
 */
@Injectable()
export class OvertimeRecordService {
  constructor(private readonly prisma: PrismaService) {}

  async history(data: {
    organizationId: string;
    scopeSpaceIds?: SpaceScopeIds;
    technicianId?: string;
    spaceId?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = clampListPage(data.page);
    const limit = clampListLimit(data.limit, 20);
    const where: any = {
      organizationId: data.organizationId,
      AND: [scopeWhere(data.scopeSpaceIds), data.spaceId ? { locationId: data.spaceId } : {}],
      ...(data.technicianId ? { technicianId: data.technicianId } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...this.window(data.from, data.to, false),
    };
    const [rows, total] = await Promise.all([
      this.prisma.overtimeRequest.findMany({ where, select: ROUND_SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.overtimeRequest.count({ where }),
    ]);
    const latest = await this.latestCycles(rows.map((r) => r.timeEntryId));
    const out = rows.map((r) => this.row(r, latest));
    const { data: list, meta } = paginated(out, { page, limit, total });
    return success({ data: list, meta });
  }

  async summary(data: {
    organizationId: string;
    scopeSpaceIds?: SpaceScopeIds;
    technicianId?: string;
    spaceId?: string;
    from?: string;
    to?: string;
  }) {
    const { from, to } = this.period(data.from, data.to);
    const scope = {
      organizationId: data.organizationId,
      AND: [scopeWhere(data.scopeSpaceIds), data.spaceId ? { locationId: data.spaceId } : {}],
      ...(data.technicianId ? { technicianId: data.technicianId } : {}),
    };
    const now = new Date();
    const [rows, waiting, runningRows] = await Promise.all([
      this.prisma.overtimeRequest.findMany({
        where: { ...scope, createdAt: { gte: from, lt: to } },
        select: ROUND_SELECT,
        orderBy: { createdAt: 'desc' },
        take: SUMMARY_CAP,
      }),
      this.prisma.overtimeRequest.count({ where: { ...scope, status: 'PENDING_APPROVAL' } }),
      // Running now, whatever the period: agreed, and the shift still open.
      this.prisma.overtimeRequest.findMany({
        where: { ...scope, status: 'APPROVED', timeEntry: { clockOutAt: null } },
        select: ROUND_SELECT,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);
    const latest = await this.latestCycles([...rows, ...runningRows].map((r) => r.timeEntryId));

    const people = new Map<string, OvertimePersonRow>();
    let workedMinutes = 0;
    let rounds = 0;
    let noAnswer = 0;
    for (const r of rows) {
      if (r.status === 'EXPIRED_NO_APPROVAL') noAnswer++;
      if (r.status !== 'APPROVED' && r.status !== 'COMPLETED') continue;
      rounds++;
      const m = overtimeRoundMinutes(this.facts(r, latest), now);
      workedMinutes += m.worked;
      const p = people.get(r.technicianId) ?? {
        userId: r.technicianId,
        userName: name(r.technician),
        avatarUrl: r.technician?.avatarUrl ?? null,
        spaceNames: [],
        rounds: 0,
        agreedMinutes: 0,
        workedMinutes: 0,
        byDay: {},
      };
      p.rounds++;
      p.agreedMinutes += m.agreed;
      p.workedMinutes += m.worked;
      const place = r.location?.name;
      if (place && !p.spaceNames.includes(place)) p.spaceNames.push(place);
      const at = r.overtimeStartAt ?? r.createdAt;
      const day = localPartsIn(at, r.location?.timezone || 'UTC').dateStr;
      if (m.worked > 0) p.byDay[day] = (p.byDay[day] ?? 0) + m.worked;
      people.set(r.technicianId, p);
    }

    // One running card per shift: its newest round.
    const seen = new Set<string>();
    const running: OvertimeRunningRound[] = [];
    for (const r of runningRows) {
      if (seen.has(r.timeEntryId) || latest.get(r.timeEntryId) !== r.cycle) continue;
      seen.add(r.timeEntryId);
      running.push({
        id: r.id,
        userId: r.technicianId,
        userName: name(r.technician),
        avatarUrl: r.technician?.avatarUrl ?? null,
        spaceName: r.location?.name ?? '',
        cycle: r.cycle,
        roundsToday: r.cycle,
        maxDurationMinutes: r.maxDurationMinutes,
        overtimeStartAt: r.overtimeStartAt?.toISOString() ?? null,
        overtimeEndAt: r.overtimeEndAt?.toISOString() ?? null,
        timezone: r.location?.timezone ?? null,
      });
    }

    const summary: OvertimeSummary = {
      from: from.toISOString(),
      to: to.toISOString(),
      totals: { workedMinutes, rounds, people: people.size, noAnswer, waiting },
      running,
      people: [...people.values()].sort((a, b) => b.workedMinutes - a.workedMinutes || a.userName.localeCompare(b.userName)),
    };
    return success(summary);
  }

  async round(data: { id: string; organizationId: string; scopeSpaceIds?: SpaceScopeIds }) {
    const r = await this.prisma.overtimeRequest.findFirst({
      where: { id: data.id, organizationId: data.organizationId, ...scopeWhere(data.scopeSpaceIds) },
      select: { ...ROUND_SELECT, leaderSignature: true, rejectedAt: true, technicianTimeoutAt: true, approvalTimeoutAt: true },
    });
    if (!r) throw new NotFoundException('Overtime not found');
    const siblings = await this.prisma.overtimeRequest.findMany({
      where: { timeEntryId: r.timeEntryId },
      select: { id: true, cycle: true, status: true, maxDurationMinutes: true, overtimeStartAt: true, overtimeEndAt: true, actualEndAt: true, overtimeMinutes: true },
      orderBy: { cycle: 'asc' },
    });
    const latest = new Map([[r.timeEntryId, Math.max(...siblings.map((s) => s.cycle))]]);
    const { leaderSignature, ...rest } = r;
    return success({
      ...this.row(rest as never, latest),
      rejectedAt: r.rejectedAt,
      technicianTimeoutAt: r.technicianTimeoutAt,
      approvalTimeoutAt: r.approvalTimeoutAt,
      signature: signatureUrl(leaderSignature),
      // The shift's other rounds, for "today in total".
      rounds: siblings.map((s) => ({
        id: s.id,
        cycle: s.cycle,
        status: s.status,
        ...overtimeRoundMinutes({ ...s, clockOutAt: r.timeEntry?.clockOutAt ?? null, superseded: s.cycle < latest.get(r.timeEntryId)! }),
      })),
    });
  }

  /* ------------------------------------------------------------ helpers */

  private row(r: RoundRow, latest: Map<string, number>) {
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

  private facts(r: RoundRow, latest: Map<string, number>) {
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
  private async latestCycles(entryIds: string[]) {
    const ids = [...new Set(entryIds)];
    if (!ids.length) return new Map<string, number>();
    const rows = await this.prisma.overtimeRequest.groupBy({ by: ['timeEntryId'], where: { timeEntryId: { in: ids } }, _max: { cycle: true } });
    return new Map(rows.map((g) => [g.timeEntryId, g._max.cycle ?? 1]));
  }

  private window(from?: string, to?: string, required = true) {
    if (!from && !to && !required) return {};
    const p = this.period(from, to);
    return { createdAt: { gte: p.from, lt: p.to } };
  }

  /** `from`/`to` as instants (the page sends the local week's edges); default: the last 7 days. */
  private period(from?: string, to?: string) {
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

const ROUND_SELECT = {
  id: true,
  cycle: true,
  status: true,
  technicianId: true,
  timeEntryId: true,
  createdAt: true,
  technicianRespondedAt: true,
  technicianReason: true,
  approvalMethod: true,
  approvedAt: true,
  leaderName: true,
  approverNotes: true,
  rejectionReason: true,
  maxDurationMinutes: true,
  overtimeStartAt: true,
  overtimeEndAt: true,
  actualEndAt: true,
  overtimeMinutes: true,
  technician: PERSON,
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
  location: { select: { id: true, name: true, timezone: true } },
  timeEntry: { select: { clockInAt: true, clockOutAt: true } },
} as const;

type RoundRow = {
  id: string;
  cycle: number;
  status: string;
  technicianId: string;
  timeEntryId: string;
  createdAt: Date;
  technicianRespondedAt: Date | null;
  technicianReason: string | null;
  approvalMethod: string | null;
  approvedAt: Date | null;
  leaderName: string | null;
  approverNotes: string | null;
  rejectionReason: string | null;
  maxDurationMinutes: number | null;
  overtimeStartAt: Date | null;
  overtimeEndAt: Date | null;
  actualEndAt: Date | null;
  overtimeMinutes: number | null;
  technician: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
  approvedBy: { id: string; firstName: string; lastName: string } | null;
  location: { id: string; name: string; timezone: string | null } | null;
  timeEntry: { clockInAt: Date; clockOutAt: Date | null } | null;
};

const name = (p: { firstName?: string | null; lastName?: string | null } | null | undefined) =>
  `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim();

/** A stored signature as something the page may draw: a PNG/JPEG data URL, else nothing. */
function signatureUrl(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.startsWith('data:')) return safeSignatureDataUrl(v);
  return /^[A-Za-z0-9+/=\s]+$/.test(v) ? safeSignatureDataUrl(`data:image/png;base64,${v.replace(/\s+/g, '')}`) : null;
}

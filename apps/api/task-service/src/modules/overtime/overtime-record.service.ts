import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PrismaService,
  clampListLimit,
  clampListPage,
  overtimeRoundMinutes,
  paginated,
  scopeWhere,
  success,
  type SpaceScopeIds,
} from '@hbcfield/shared';
import { ROUND_SELECT, signatureUrl } from './overtime-record-helpers';
import { createdWindow, latestCycles, roundRow } from './overtime-round-rows';
import type { Prisma, OvertimeRequestStatus } from '@prisma/client';

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
    const where: Prisma.OvertimeRequestWhereInput = {
      organizationId: data.organizationId,
      AND: [scopeWhere(data.scopeSpaceIds), data.spaceId ? { locationId: data.spaceId } : {}],
      ...(data.technicianId ? { technicianId: data.technicianId } : {}),
      ...(data.status ? { status: data.status as OvertimeRequestStatus } : {}),
      ...createdWindow(data.from, data.to, false),
    };
    const [rows, total] = await Promise.all([
      this.prisma.overtimeRequest.findMany({
        where,
        select: ROUND_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.overtimeRequest.count({ where }),
    ]);
    const latest = await latestCycles(
      this.prisma,
      rows.map((r) => r.timeEntryId),
    );
    const out = rows.map((r) => roundRow(r, latest));
    const { data: list, meta } = paginated(out, { page, limit, total });
    return success({ data: list, meta });
  }

  async round(data: { id: string; organizationId: string; scopeSpaceIds?: SpaceScopeIds }) {
    const r = await this.prisma.overtimeRequest.findFirst({
      where: { id: data.id, organizationId: data.organizationId, ...scopeWhere(data.scopeSpaceIds) },
      select: {
        ...ROUND_SELECT,
        leaderSignature: true,
        rejectedAt: true,
        technicianTimeoutAt: true,
        approvalTimeoutAt: true,
      },
    });
    if (!r) throw new NotFoundException('Overtime not found');
    const siblings = await this.prisma.overtimeRequest.findMany({
      where: { timeEntryId: r.timeEntryId },
      select: {
        id: true,
        cycle: true,
        status: true,
        maxDurationMinutes: true,
        overtimeStartAt: true,
        overtimeEndAt: true,
        actualEndAt: true,
        overtimeMinutes: true,
      },
      orderBy: { cycle: 'asc' },
    });
    const latest = new Map([[r.timeEntryId, Math.max(...siblings.map((s) => s.cycle))]]);
    const { leaderSignature, ...rest } = r;
    return success({
      ...roundRow(rest as never, latest),
      rejectedAt: r.rejectedAt,
      technicianTimeoutAt: r.technicianTimeoutAt,
      approvalTimeoutAt: r.approvalTimeoutAt,
      signature: signatureUrl(leaderSignature),
      // The shift's other rounds, for "today in total".
      rounds: siblings.map((s) => ({
        id: s.id,
        cycle: s.cycle,
        status: s.status,
        ...overtimeRoundMinutes({
          ...s,
          clockOutAt: r.timeEntry?.clockOutAt ?? null,
          superseded: s.cycle < latest.get(r.timeEntryId)!,
        }),
      })),
    });
  }
}

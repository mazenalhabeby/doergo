import { Injectable } from '@nestjs/common';
import {
  PrismaService,
  zoneOf,
  localPartsIn,
  overtimeRoundMinutes,
  scopeWhere,
  success,
  type OvertimePersonRow,
  type OvertimeRunningRound,
  type OvertimeSummary,
  type SpaceScopeIds,
} from '@hbcfield/shared';
import { SUMMARY_CAP, ROUND_SELECT, name } from './overtime-record-helpers';
import { latestCycles, overtimePeriod, roundFacts } from './overtime-round-rows';

/** The Overtime page's numbers for a period: totals, running now, and per person by day. */
@Injectable()
export class OvertimeSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(data: {
    organizationId: string;
    scopeSpaceIds?: SpaceScopeIds;
    technicianId?: string;
    spaceId?: string;
    from?: string;
    to?: string;
  }) {
    const { from, to } = overtimePeriod(data.from, data.to);
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
    const latest = await latestCycles(
      this.prisma,
      [...rows, ...runningRows].map((r) => r.timeEntryId),
    );

    const people = new Map<string, OvertimePersonRow>();
    let workedMinutes = 0;
    let rounds = 0;
    let noAnswer = 0;
    for (const r of rows) {
      if (r.status === 'EXPIRED_NO_APPROVAL') noAnswer++;
      if (r.status !== 'APPROVED' && r.status !== 'COMPLETED') continue;
      rounds++;
      const m = overtimeRoundMinutes(roundFacts(r, latest), now);
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
      const day = localPartsIn(at, zoneOf(r.location?.timezone)).dateStr;
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
      people: [...people.values()].sort(
        (a, b) => b.workedMinutes - a.workedMinutes || a.userName.localeCompare(b.userName),
      ),
    };
    return success(summary);
  }
}

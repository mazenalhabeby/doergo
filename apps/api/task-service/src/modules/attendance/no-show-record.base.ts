import { Injectable } from '@nestjs/common';
import { NO_SHOW_OPEN_STATES, noShowRuns, type NoShowRun } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RUN_DAYS, DAY, Instance } from './no-show-record-helpers';

/**
 * What the no-show record reads share: workspace names and rows, the runs of open
 * days, a month's facts, and the hints on a run.
 */
@Injectable()
export abstract class NoShowRecordBase {
  constructor(protected readonly prisma: PrismaService) {}

  /* ------------------------------------------------------------ helpers */

  protected async spaceNames(organizationId: string, ids: (string | null)[]) {
    return new Map([...(await this.spaceRows(organizationId, ids)).entries()].map(([id, s]) => [id, s.name]));
  }

  protected async spaceRows(organizationId: string, ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((v): v is string => !!v))];
    if (!unique.length) return new Map<string, { name: string; timezone: string | null }>();
    const rows = await this.prisma.companyLocation.findMany({
      where: { id: { in: unique }, organizationId },
      select: { id: true, name: true, timezone: true },
    });
    return new Map(rows.map((s) => [s.id, { name: s.name, timezone: s.timezone }]));
  }

  /** Each open row's run — read from every instance of the same shifts, two months back. */
  protected async runsFor(open: Pick<Instance, 'id' | 'userId' | 'spaceId' | 'shiftId'>[], now: Date) {
    if (!open.length) return new Map<string, NoShowRun>();
    const all = await this.prisma.shiftInstance.findMany({
      where: {
        userId: { in: [...new Set(open.map((r) => r.userId))] },
        shiftId: { in: [...new Set(open.map((r) => r.shiftId))] },
        expectedClockInAt: { gte: new Date(now.getTime() - RUN_DAYS * DAY), lte: now },
      },
      select: { id: true, userId: true, spaceId: true, shiftId: true, localDate: true, state: true },
    });
    return noShowRuns(all);
  }

  /** Missed this month (open + absent), per person and month — one query. */
  protected async monthFacts(open: Instance[]) {
    const out = new Map<string, number>();
    if (!open.length) return out;
    const months = [...new Set(open.map((r) => r.localDate.slice(0, 7)))].sort();
    const rows = await this.prisma.shiftInstance.findMany({
      where: {
        userId: { in: [...new Set(open.map((r) => r.userId))] },
        state: { in: [...NO_SHOW_OPEN_STATES, 'ABSENT'] },
        localDate: { gte: `${months[0]}-01`, lte: `${months[months.length - 1]}-31` },
      },
      select: { userId: true, localDate: true },
    });
    for (const r of rows) {
      const k = `${r.userId}|${r.localDate.slice(0, 7)}`;
      out.set(k, (out.get(k) ?? 0) + 1);
    }
    return out;
  }

  /**
   * What a run of misses most likely means, from where the person DID clock in
   * across those days: mostly at another workspace (the shift is on the wrong
   * one), or nowhere since a date. Keyed by the run's newest id.
   */
  protected async runHints(open: Instance[], runs: Map<string, NoShowRun>, organizationId: string) {
    const out = new Map<
      string,
      { kind: 'ELSEWHERE'; spaceName: string; days: number } | { kind: 'NOT_SEEN'; since: string | null }
    >();
    const latest = open.filter((r) => runs.get(r.id)?.latestId === r.id && (runs.get(r.id)?.count ?? 0) > 1);
    if (!latest.length) return out;
    const userIds = [...new Set(latest.map((r) => r.userId))];
    const from = new Date(
      Math.min(...latest.map((r) => new Date(`${runs.get(r.id)!.from}T00:00:00.000Z`).getTime())) - DAY,
    );
    const entries = await this.prisma.timeEntry.findMany({
      where: { userId: { in: userIds }, clockInAt: { gte: from }, approvalStatus: { not: 'REJECTED' } },
      select: { userId: true, locationId: true, clockInAt: true },
    });
    const last = await this.prisma.timeEntry.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, approvalStatus: { not: 'REJECTED' } },
      _max: { clockInAt: true },
    });
    const lastBy = new Map(last.map((l) => [l.userId, l._max.clockInAt]));
    const names = await this.spaceNames(
      organizationId,
      entries.map((e) => e.locationId),
    );
    for (const r of latest) {
      const run = runs.get(r.id)!;
      const start = new Date(`${run.from}T00:00:00.000Z`).getTime() - 14 * 3_600_000;
      const end = new Date(`${run.to}T23:59:59.999Z`).getTime() + 14 * 3_600_000;
      const elsewhere = new Map<string, Set<string>>();
      for (const e of entries) {
        const t = e.clockInAt.getTime();
        if (e.userId !== r.userId || e.locationId === r.spaceId || t < start || t > end) continue;
        const days = elsewhere.get(e.locationId) ?? new Set<string>();
        days.add(e.clockInAt.toISOString().slice(0, 10));
        elsewhere.set(e.locationId, days);
      }
      const best = [...elsewhere.entries()].sort((a, b) => b[1].size - a[1].size)[0];
      if (best && best[1].size >= Math.ceil(run.count / 2)) {
        out.set(r.id, { kind: 'ELSEWHERE', spaceName: names.get(best[0]) ?? '', days: best[1].size });
      } else {
        const seen = lastBy.get(r.userId);
        out.set(r.id, { kind: 'NOT_SEEN', since: seen ? seen.toISOString() : null });
      }
    }
    return out;
  }
}

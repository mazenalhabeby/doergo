import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  NO_SHOW_OPEN_STATES,
  isNoShowExcuseReason,
  isOpenNoShow,
  noShowDayMark,
  noShowRuns,
  scopeWhereOn,
  success,
  type AttendanceScope,
  type NoShowDayMark,
  type NoShowPersonSummary,
  type NoShowRun,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertNotSelfDecision } from './self-decision';

/** How far back a run of misses is looked for. */
const RUN_DAYS = 60;
const DAY = 86_400_000;

/** Worst first: what a day shows when two shifts that day ended differently. */
const MARK_RANK: Record<NoShowDayMark, number> = { open: 0, absent: 1, excused: 2, late: 3, worked: 4, planned: 5 };

type Instance = {
  id: string;
  organizationId: string;
  userId: string;
  spaceId: string;
  shiftId: string;
  localDate: string;
  expectedClockInAt: Date;
  expectedClockOutAt: Date;
  state: string;
  reminderCount: number;
  timeEntryId: string | null;
  excuseReason: string | null;
  closeReason: string | null;
  closedAutomatically: boolean;
  settledSpaceId: string | null;
};

/**
 * The no-show RECORD and its decisions (shared attendance/no-show.ts):
 *
 *  - `list` — what the inbox and the home Crew card read. Open ones carry
 *    their RUN (the same person missing the same shift day after day is ONE
 *    item: only the newest is `runLatest`) and the facts a leader decides on.
 *  - `resolve` — excused (with what happened), absent, or reopened; for one
 *    day or the whole run, which the server finds itself — a client never
 *    names the rows a decision reaches.
 *  - `summary` — the Attendance → No-shows record, one row per person.
 */
@Injectable()
export class NoShowRecordService {
  constructor(private readonly prisma: PrismaService) {}

  async list(data: { organizationId: string; days?: number; spaceId?: string; scopeSpaceIds?: AttendanceScope; open?: boolean }) {
    const now = new Date();
    const since = new Date(now.getTime() - (data.days ?? 7) * DAY);
    const rows = await this.prisma.shiftInstance.findMany({
      where: {
        organizationId: data.organizationId,
        // ⚠️ BOTH, AND-ed — spreading the scope after `{ spaceId }` REPLACED the key.
        AND: [data.spaceId ? { spaceId: data.spaceId } : {}, scopeWhereOn('spaceId', data.scopeSpaceIds)],
        state: { in: data.open ? [...NO_SHOW_OPEN_STATES] : [...NO_SHOW_OPEN_STATES, 'EXCUSED', 'ABSENT'] },
        expectedClockInAt: { gte: since, lte: now },
      },
      orderBy: { expectedClockInAt: 'desc' },
      take: 300,
    });
    if (rows.length === 0) return success([]);

    const userIds = [...new Set(rows.map((r) => r.userId))];
    const openRows = rows.filter((r) => isOpenNoShow(r.state));
    const [users, spaces, runs, facts] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, avatarUrl: true, lastActiveAt: true },
      }),
      this.spaceRows(data.organizationId, rows.flatMap((r) => [r.spaceId, r.settledSpaceId])),
      this.runsFor(openRows, now),
      this.monthFacts(openRows),
    ]);
    const uMap = new Map(users.map((u) => [u.id, u]));
    const hints = await this.runHints(openRows, runs, data.organizationId);

    return success(
      rows.map((r) => {
        const u = uMap.get(r.userId);
        const run = runs.get(r.id);
        return {
          id: r.id,
          userId: r.userId,
          userName: u ? `${u.firstName} ${u.lastName}` : 'Unknown',
          avatarUrl: u?.avatarUrl ?? null,
          spaceId: r.spaceId,
          spaceName: spaces.get(r.spaceId)?.name ?? 'Space',
          timezone: spaces.get(r.spaceId)?.timezone ?? null,
          expectedClockInAt: r.expectedClockInAt,
          expectedClockOutAt: r.expectedClockOutAt,
          state: r.state,
          reminderCount: r.reminderCount,
          localDate: r.localDate,
          excuseReason: r.excuseReason ?? null,
          closeReason: r.closeReason ?? null,
          closedAutomatically: r.closedAutomatically,
          settledSpaceName: r.settledSpaceId ? spaces.get(r.settledSpaceId)?.name ?? null : null,
          ...(isOpenNoShow(r.state)
            ? {
                lastActiveAt: u?.lastActiveAt ?? null,
                missedThisMonth: facts.get(`${r.userId}|${r.localDate.slice(0, 7)}`) ?? 1,
                run: run && run.count > 1 ? { count: run.count, from: run.from, to: run.to } : null,
                // The inbox shows one item per run: the newest.
                runLatest: !run || run.latestId === r.id,
                hint: run && run.count > 1 ? hints.get(run.latestId) ?? null : null,
              }
            : {}),
        };
      }),
    );
  }

  async resolve(data: {
    id: string;
    organizationId: string;
    action: 'excuse' | 'absent' | 'reopen';
    reasonCode?: string;
    reason?: string;
    wholeRun?: boolean;
    excusedById?: string;
    scopeSpaceIds?: AttendanceScope;
  }) {
    const inst = await this.prisma.shiftInstance.findFirst({
      // A no-show in a space the caller was not granted reads as 'not found'.
      where: { id: data.id, organizationId: data.organizationId, ...scopeWhereOn('spaceId', data.scopeSpaceIds) },
    });
    if (!inst) throw new NotFoundException('No-show not found');
    await assertNotSelfDecision(this.prisma as never, {
      deciderId: data.excusedById,
      subjectId: inst.userId,
      organizationId: data.organizationId,
      message: 'You cannot decide your own missed shift. Ask a manager or an administrator.',
    });

    if (data.action === 'reopen') {
      if (inst.state !== 'EXCUSED' && inst.state !== 'ABSENT') throw new BadRequestException({ code: 'NO_SHOW_NOT_DECIDED', message: 'Only a decided no-show can be reopened.' });
      // Back to waiting for a decision — never back to nudging the person about an old day.
      const updated = await this.prisma.shiftInstance.update({
        where: { id: inst.id },
        data: { state: 'ESCALATED', nextRemindAt: null, excuseReason: null, excusedById: null, closeReason: null, closedAutomatically: false, decidedAt: null, settledSpaceId: null },
      });
      return success(updated);
    }

    if (!isOpenNoShow(inst.state)) throw new BadRequestException({ code: 'NO_SHOW_ALREADY_DECIDED', message: 'This no-show was already decided.' });
    const ids = data.wholeRun ? (await this.runsFor([inst], new Date())).get(inst.id)?.ids ?? [inst.id] : [inst.id];
    const now = new Date();
    const excuse = data.action === 'excuse';
    const res = await this.prisma.shiftInstance.updateMany({
      // Only the ones still open — a day closed meanwhile keeps its own answer.
      where: { id: { in: ids }, state: { in: [...NO_SHOW_OPEN_STATES] } },
      data: {
        state: excuse ? 'EXCUSED' : 'ABSENT',
        nextRemindAt: null,
        closeReason: excuse ? (isNoShowExcuseReason(data.reasonCode) ? data.reasonCode : 'OTHER') : null,
        closedAutomatically: false,
        excuseReason: data.reason?.trim().slice(0, 500) || null,
        excusedById: data.excusedById ?? null,
        decidedAt: now,
      },
    });
    return success({ id: inst.id, state: excuse ? 'EXCUSED' : 'ABSENT', decided: res.count });
  }

  /** The Attendance → No-shows record: one row per person who missed a planned shift in the period. */
  async summary(data: { organizationId: string; days?: number; spaceId?: string; scopeSpaceIds?: AttendanceScope }) {
    const now = new Date();
    const since = new Date(now.getTime() - (data.days ?? 30) * DAY);
    const scope = {
      organizationId: data.organizationId,
      AND: [data.spaceId ? { spaceId: data.spaceId } : {}, scopeWhereOn('spaceId', data.scopeSpaceIds)],
      expectedClockInAt: { gte: since, lte: now },
    };
    // Who had anything to do with a no-show: missed, decided, or came in only after being chased.
    const touched = await this.prisma.shiftInstance.findMany({
      where: { ...scope, OR: [{ state: { in: [...NO_SHOW_OPEN_STATES, 'EXCUSED', 'ABSENT'] } }, { state: 'PRESENT', reminderCount: { gt: 0 } }] },
      select: { userId: true },
      distinct: ['userId'],
      take: 500,
    });
    if (!touched.length) return success([]);
    const userIds = touched.map((t) => t.userId);
    const all = (await this.prisma.shiftInstance.findMany({
      where: { ...scope, userId: { in: userIds }, state: { not: 'PENDING' } },
      orderBy: { expectedClockInAt: 'asc' },
    })) as Instance[];
    const entryIds = all.map((r) => r.timeEntryId).filter((v): v is string => !!v);
    const [users, spaces, entries] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, avatarUrl: true } }),
      this.spaceNames(data.organizationId, all.map((r) => r.spaceId)),
      entryIds.length
        ? this.prisma.timeEntry.findMany({ where: { id: { in: entryIds } }, select: { id: true, clockInAt: true } })
        : Promise.resolve([]),
    ]);
    const clockIn = new Map(entries.map((e) => [e.id, e.clockInAt]));

    const out: NoShowPersonSummary[] = [];
    for (const u of users) {
      const mine = all.filter((r) => r.userId === u.id);
      const byDay = new Map<string, { mark: NoShowDayMark; instanceId: string }>();
      let absent = 0, excused = 0, settled = 0, open = 0;
      for (const r of mine) {
        const mark = noShowDayMark(r, r.timeEntryId ? clockIn.get(r.timeEntryId) : null);
        const prev = byDay.get(r.localDate);
        if (!prev || MARK_RANK[mark] < MARK_RANK[prev.mark]) byDay.set(r.localDate, { mark, instanceId: r.id });
        if (r.state === 'ABSENT') absent++;
        else if (r.state === 'EXCUSED') (r.closedAutomatically ? settled++ : excused++);
        else if (isOpenNoShow(r.state)) open++;
        else if (r.state === 'PRESENT' && r.reminderCount > 0) settled++;
      }
      if (absent + excused + settled + open === 0) continue;
      const days = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(-7).map(([localDate, d]) => ({ localDate, ...d }));
      out.push({
        userId: u.id,
        userName: `${u.firstName} ${u.lastName}`.trim(),
        avatarUrl: u.avatarUrl ?? null,
        spaceNames: [...new Set(mine.map((r) => spaces.get(r.spaceId) ?? ''))].filter(Boolean),
        days,
        absent,
        excused,
        settled,
        open,
        closed: mine
          .filter((r) => r.state === 'EXCUSED' || r.state === 'ABSENT')
          .reverse()
          .slice(0, 20)
          .map((r) => ({
            id: r.id,
            localDate: r.localDate,
            spaceName: spaces.get(r.spaceId) ?? '',
            expectedClockInAt: r.expectedClockInAt.toISOString(),
            state: r.state as 'EXCUSED' | 'ABSENT',
            closeReason: r.closeReason,
            closedAutomatically: r.closedAutomatically,
            note: r.excuseReason,
          })),
      });
    }
    // Most to look at first: open, then absent.
    out.sort((a, b) => b.open - a.open || b.absent - a.absent || a.userName.localeCompare(b.userName));
    return success(out);
  }

  /* ------------------------------------------------------------ helpers */

  private async spaceNames(organizationId: string, ids: (string | null)[]) {
    return new Map([...(await this.spaceRows(organizationId, ids)).entries()].map(([id, s]) => [id, s.name]));
  }

  private async spaceRows(organizationId: string, ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((v): v is string => !!v))];
    if (!unique.length) return new Map<string, { name: string; timezone: string | null }>();
    const rows = await this.prisma.companyLocation.findMany({ where: { id: { in: unique }, organizationId }, select: { id: true, name: true, timezone: true } });
    return new Map(rows.map((s) => [s.id, { name: s.name, timezone: s.timezone }]));
  }

  /** Each open row's run — read from every instance of the same shifts, two months back. */
  private async runsFor(open: Pick<Instance, 'id' | 'userId' | 'spaceId' | 'shiftId'>[], now: Date) {
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
  private async monthFacts(open: Instance[]) {
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
  private async runHints(open: Instance[], runs: Map<string, NoShowRun>, organizationId: string) {
    const out = new Map<string, { kind: 'ELSEWHERE'; spaceName: string; days: number } | { kind: 'NOT_SEEN'; since: string | null }>();
    const latest = open.filter((r) => runs.get(r.id)?.latestId === r.id && (runs.get(r.id)?.count ?? 0) > 1);
    if (!latest.length) return out;
    const userIds = [...new Set(latest.map((r) => r.userId))];
    const from = new Date(Math.min(...latest.map((r) => new Date(`${runs.get(r.id)!.from}T00:00:00.000Z`).getTime())) - DAY);
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
    const names = await this.spaceNames(organizationId, entries.map((e) => e.locationId));
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

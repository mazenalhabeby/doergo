import { Injectable } from '@nestjs/common';
import {
  personName,
  NO_SHOW_OPEN_STATES,
  isOpenNoShow,
  noShowDayMark,
  scopeWhereOn,
  success,
  type AttendanceScope,
  type NoShowDayMark,
  type NoShowPersonSummary,
} from '@hbcfield/shared';
import { DAY, MARK_RANK, Instance } from './no-show-record-helpers';
import { NoShowRecordBase } from './no-show-record.base';

/** The no-show record as a summary: one row per person, in a period. */
@Injectable()
export class NoShowSummaryService extends NoShowRecordBase {
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
      where: {
        ...scope,
        OR: [
          { state: { in: [...NO_SHOW_OPEN_STATES, 'EXCUSED', 'ABSENT'] } },
          { state: 'PRESENT', reminderCount: { gt: 0 } },
        ],
      },
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
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      }),
      this.spaceNames(
        data.organizationId,
        all.map((r) => r.spaceId),
      ),
      entryIds.length
        ? this.prisma.timeEntry.findMany({ where: { id: { in: entryIds } }, select: { id: true, clockInAt: true } })
        : Promise.resolve([]),
    ]);
    const clockIn = new Map(entries.map((e) => [e.id, e.clockInAt]));

    const out: NoShowPersonSummary[] = [];
    for (const u of users) {
      const mine = all.filter((r) => r.userId === u.id);
      const byDay = new Map<string, { mark: NoShowDayMark; instanceId: string }>();
      let absent = 0,
        excused = 0,
        settled = 0,
        open = 0;
      for (const r of mine) {
        const mark = noShowDayMark(r, r.timeEntryId ? clockIn.get(r.timeEntryId) : null);
        const prev = byDay.get(r.localDate);
        if (!prev || MARK_RANK[mark] < MARK_RANK[prev.mark]) byDay.set(r.localDate, { mark, instanceId: r.id });
        if (r.state === 'ABSENT') absent++;
        else if (r.state === 'EXCUSED') r.closedAutomatically ? settled++ : excused++;
        else if (isOpenNoShow(r.state)) open++;
        else if (r.state === 'PRESENT' && r.reminderCount > 0) settled++;
      }
      if (absent + excused + settled + open === 0) continue;
      const days = [...byDay.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .slice(-7)
        .map(([localDate, d]) => ({ localDate, ...d }));
      out.push({
        userId: u.id,
        userName: personName(u),
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
}

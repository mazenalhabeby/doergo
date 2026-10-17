import { Injectable } from '@nestjs/common';
import {
  zoneOf,
  coverOn,
  floorStatus,
  hasRota,
  isRosteredOn,
  leaveCovers,
  localPartsIn,
  parseHm,
  tradeOf,
  zonedWallTimeToUtc,
} from '@hbcfield/shared';
import { CoverBase } from './cover.base';

/** The live floor: who is expected now, who is in, who is late, who is off — per workspace. */
@Injectable()
export class CoverFloorService extends CoverBase {

  /**
   * Who is on the floor right now.
   *
   * Two numbers, deliberately: EXPECTED comes from the rota, HERE comes from the
   * clock. A single "available" figure hides the only actionable thing on the
   * panel — the gap between them, which is somebody who has not turned up.
   *
   * Read-only and cheap: six indexed queries bounded by the org's size, so the
   * screen can poll it without thinking about cost.
   */
  async floorNow(organizationId: string, scopeSpaceIds?: string[]) {
    if (scopeSpaceIds !== undefined && scopeSpaceIds.length === 0) return [];

    const spaces = await this.prisma.companyLocation.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(scopeSpaceIds !== undefined ? { id: { in: scopeSpaceIds } } : {}),
      },
      select: { id: true, name: true, minCover: true, timezone: true },
      orderBy: { name: 'asc' },
    });
    if (!spaces.length) return [];

    const spaceIds = spaces.map((s) => s.id);
    const nowForSpan = new Date();
    const spanKeys = spaces.map((s) => localPartsIn(nowForSpan, zoneOf(s.timezone)).dateStr).sort();
    const rosterBySpace = await this.rosters(organizationId, spaceIds, { from: spanKeys[0]!, to: spanKeys[spanKeys.length - 1]! });
    const people = [...rosterBySpace.values()].flat();
    const personIds = [...new Set(people.map((p) => p.id))];
    if (!personIds.length) {
      return spaces.map((s) => ({
        spaceId: s.id, spaceName: s.name, minCover: s.minCover,
        here: 0, expected: 0, status: 'ok', rotaKnown: false, people: [],
      }));
    }

    /*
      "Today" is a fact about each SITE, not about the server.

      A workspace in another zone rolls over at a different moment, and reading
      the server's date would put a member on the wrong day either side of
      midnight — which on this panel means reporting somebody as a no-show for a
      shift that has not started.
    */
    const now = new Date();
    const dayOfSpace = new Map(spaces.map((s) => [s.id, localPartsIn(now, zoneOf(s.timezone))]));
    const todaySpan = [...new Set([...dayOfSpace.values()].map((p) => p.dateStr))].sort();
    const from = todaySpan[0]!;
    const to = todaySpan[todaySpan.length - 1]!;

    const [leave, entries, breaks, tasks, shiftInstances] = await Promise.all([
      this.approvedLeave(personIds, from, to),
      this.prisma.timeEntry.findMany({
        where: { organizationId, status: 'CLOCKED_IN', userId: { in: personIds } },
        select: { id: true, userId: true, clockInAt: true, locationId: true, isRemote: true },
      }),
      this.prisma.break.findMany({
        where: { endedAt: null, timeEntry: { organizationId, status: 'CLOCKED_IN' } },
        select: { timeEntryId: true, startedAt: true, type: true },
      }),
      // What they are actually on. Only the statuses that mean "working it".
      this.prisma.task.findMany({
        where: {
          organizationId,
          assignedToId: { in: personIds },
          status: { in: ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'] },
        },
        select: { id: true, title: true, status: true, assignedToId: true },
        orderBy: { updatedAt: 'desc' },
      }),
      // The rota's own answer to "when were they due", already resolved to the
      // right zone by the materializer. Preferred over the weekly schedule
      // because it is what the no-show sweep itself acts on.
      this.prisma.shiftInstance.findMany({
        where: {
          organizationId,
          userId: { in: personIds },
          spaceId: { in: spaceIds },
          localDate: { in: todaySpan },
        },
        select: { userId: true, spaceId: true, localDate: true, expectedClockInAt: true },
      }),
    ]);

    const entryByUser = new Map(entries.map((e) => [e.userId, e]));
    const breakByEntry = new Map(breaks.map((b) => [b.timeEntryId, b]));
    const taskByUser = new Map<string, (typeof tasks)[number]>();
    for (const t of tasks) if (t.assignedToId && !taskByUser.has(t.assignedToId)) taskByUser.set(t.assignedToId, t);
    const instanceKey = (u: string, sp: string) => `${u}:${sp}`;
    const dueByPerson = new Map(
      shiftInstances.map((i) => [instanceKey(i.userId, i.spaceId), i.expectedClockInAt]),
    );

    return spaces.map((space) => {
      const tz = zoneOf(space.timezone);
      const parts = dayOfSpace.get(space.id)!;
      const today = parts.dateStr;
      const roster = rosterBySpace.get(space.id) ?? [];
      const day = coverOn(roster, leave, today);
      const awayIds = new Set(day.away.map((p) => p.id));

      /**
       * When were they due in?
       *
       * The rota's materialized instance first — it is what the no-show sweep
       * acts on, so the panel and the escalation cannot disagree about who is
       * late. The weekly schedule's start time otherwise, resolved in the
       * SITE's zone. Null when neither is set, and the chip then simply says
       * they have not clocked in, with no claim about lateness.
       */
      const dueFor = (p: (typeof roster)[number]): Date | null => {
        const fromRota = dueByPerson.get(instanceKey(p.id, space.id));
        if (fromRota) return fromRota;
        const hm = p.startByDow?.[parts.dow];
        if (!hm) return null;
        const [hh, mm] = parseHm(hm);
        return zonedWallTimeToUtc(today, hh, mm, tz);
      };

      const rows = roster.map((p) => {
        const onLeave = leave.find((l) => l.personId === p.id && leaveCovers(l, today));
        const entry = entryByUser.get(p.id);
        const onBreak = entry ? breakByEntry.get(entry.id) : undefined;
        const task = taskByUser.get(p.id);

        /*
          The order of these three tests is the rule, and getting it wrong is how
          a rota system ends up chasing somebody for not clocking in on their day
          off. Leave beats the rota (they are not coming), the rota beats the
          clock (a rest day is not a no-show), and only then does the clock speak.
        */
        const state = onLeave
          ? 'leave'
          : !isRosteredOn(p, today)
            ? 'rest'
            : onBreak
              ? 'break'
              : entry
                ? (task ? 'busy' : 'working')
                : 'expected';

        // Only somebody who is expected and absent can be LATE. A person on a
        // break has already arrived, and one on leave was never coming.
        const dueAt = state === 'expected' ? dueFor(p) : null;

        return {
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          specialty: p.specialty,
          position: p.position,
          // The one field a screen should print: specialty when somebody filled
          // it in, position otherwise. Resolved here so every surface agrees.
          trade: tradeOf(p),
          state,
          since: entry?.clockInAt ?? null,
          isRemote: entry?.isRemote ?? false,
          breakSince: onBreak?.startedAt ?? null,
          leaveUntil: onLeave?.to ?? null,
          dueAt,
          /** Minutes past due. Negative = still to come, so a screen can stay calm. */
          lateMinutes: dueAt ? Math.round((now.getTime() - dueAt.getTime()) / 60000) : null,
          task: task ? { id: task.id, title: task.title, status: task.status } : null,
        };
      });

      const here = rows.filter((r) => r.state === 'busy' || r.state === 'working' || r.state === 'break').length;
      const expected = roster.filter((p) => !awayIds.has(p.id) && isRosteredOn(p, today)).length;

      return {
        spaceId: space.id,
        spaceName: space.name,
        timezone: space.timezone,
        minCover: space.minCover,
        here,
        expected,
        status: floorStatus(here, space.minCover),
        rotaKnown: roster.some(hasRota),
        people: rows,
      };
    });
  }
}

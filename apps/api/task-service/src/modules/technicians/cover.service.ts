import { Injectable } from '@nestjs/common';
import {
  PrismaService,
  assessLeave,
  coverOn,
  daysBrief,
  eachDay,
  floorStatus,
  hasRota,
  isRosteredOn,
  leaveCovers,
  localPartsIn,
  parseHm,
  tradeOf,
  zonedWallTimeToUtc,
  verdictOf,
  type CoverLeave,
  type CoverPerson,
  type CoverSpace,
  type CoverDayBrief,
  type CoverRangeDay,
  type CoverVerdict,
  type DateKey,
} from '@hbcfield/shared';

/**
 * Everything the product knows about whether there will be enough people.
 *
 * Its own service rather than more methods on TechniciansService, because it
 * answers ONE question — cover — for callers that otherwise have nothing to do
 * with each other: the leave list wants a verdict per request, the floor panel
 * wants the present tense, and a member asking for days wants a warning. Keeping
 * them together is what stops three slightly different answers appearing on
 * three screens.
 *
 * The RULES are not here. They are pure functions in @hbcfield/shared, so the
 * web and the phone can label what this returns without re-deriving it. This
 * class does the part a pure function cannot: fetch the roster and the leave, in
 * a bounded number of queries, whatever the size of the question.
 */
@Injectable()
export class CoverService {
  constructor(private readonly prisma: PrismaService) {}

  /** A Date → the local calendar day the rota means. */
  private static key(d: Date | string): DateKey {
    return (typeof d === 'string' ? new Date(d) : d).toISOString().slice(0, 10);
  }

  /**
   * The roster of every given space, shaped for the rules.
   *
   * ONE query for the people and ONE for their rota, regardless of how many
   * spaces or requests are in play. The alternative — resolving each request's
   * workspace separately — is the N+1 that makes an approvals list unusable at
   * fifty pending requests.
   */
  private async rosters(organizationId: string, spaceIds: string[]) {
    const bySpace = new Map<string, CoverPerson[]>();
    if (!spaceIds.length) return bySpace;

    const assignments = await this.prisma.spaceAssignment.findMany({
      where: {
        organizationId,
        spaceId: { in: spaceIds },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
        user: { isActive: true },
      },
      select: {
        spaceId: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialty: true,
            position: true,
            // `startTime` is what makes "due 08:00 · 2h 42m ago" possible.
            // Without it the panel can only say "not clocked in", which names a
            // state nobody can act on.
            schedules: { where: { isActive: true }, select: { dayOfWeek: true, startTime: true } },
          },
        },
      },
    });

    const userIds = [...new Set(assignments.map((a) => a.user.id))];
    const shifts = userIds.length
      ? await this.prisma.shiftAssignment.findMany({
          where: { organizationId, userId: { in: userIds }, spaceId: { in: spaceIds }, isActive: true },
          select: {
            userId: true,
            spaceId: true,
            recurrence: true,
            daysOfWeek: true,
            daysOfMonth: true,
            dates: true,
            effectiveFrom: true,
            effectiveTo: true,
          },
        })
      : [];

    for (const s of spaceIds) bySpace.set(s, []);
    for (const a of assignments) {
      const list = bySpace.get(a.spaceId);
      if (!list) continue;
      // A member can hold two assignments in one space over time; count them once.
      if (list.some((p) => p.id === a.user.id)) continue;
      list.push({
        id: a.user.id,
        firstName: a.user.firstName,
        lastName: a.user.lastName,
        spaceId: a.spaceId,
        specialty: a.user.specialty,
        position: a.user.position,
        scheduleDows: [...new Set(a.user.schedules.map((s) => s.dayOfWeek))],
        startByDow: Object.fromEntries(a.user.schedules.map((s) => [s.dayOfWeek, s.startTime])),
        shiftRules: shifts
          .filter((r) => r.userId === a.user.id && r.spaceId === a.spaceId)
          .map((r) => ({
            recurrence: r.recurrence as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ONE_OFF',
            daysOfWeek: r.daysOfWeek,
            daysOfMonth: r.daysOfMonth,
            dates: r.dates.map((d) => CoverService.key(d)),
            effectiveFrom: CoverService.key(r.effectiveFrom),
            effectiveTo: r.effectiveTo ? CoverService.key(r.effectiveTo) : null,
          })),
      });
    }
    return bySpace;
  }

  /** Approved leave for these people, overlapping this window. One query. */
  private async approvedLeave(
    personIds: string[],
    from: DateKey,
    to: DateKey,
  ): Promise<CoverLeave[]> {
    if (!personIds.length) return [];
    const rows = await this.prisma.timeOff.findMany({
      where: {
        technicianId: { in: personIds },
        status: 'APPROVED',
        startDate: { lte: new Date(`${to}T23:59:59.999Z`) },
        endDate: { gte: new Date(`${from}T00:00:00.000Z`) },
      },
      select: { id: true, technicianId: true, startDate: true, endDate: true },
    });
    return rows.map((r) => ({
      id: r.id,
      personId: r.technicianId,
      from: CoverService.key(r.startDate),
      to: CoverService.key(r.endDate),
    }));
  }

  /**
   * Which workspace does this person's absence thin?
   *
   * Their primary assignment, falling back to the first — the same choice the
   * availability calendar already makes, so the two screens name the same place.
   */
  private async spaceOfEach(organizationId: string, personIds: string[]) {
    const out = new Map<string, string>();
    if (!personIds.length) return out;
    const rows = await this.prisma.spaceAssignment.findMany({
      where: {
        organizationId,
        userId: { in: personIds },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      select: { userId: true, spaceId: true, isPrimary: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    for (const r of rows) if (!out.has(r.userId)) out.set(r.userId, r.spaceId);
    return out;
  }

  /**
   * A cover verdict for each of these leave requests.
   *
   * Four queries total, no matter how many requests: their workspaces, those
   * workspaces' rosters, the rotas, and the approved leave across the whole
   * window. Everything after that is arithmetic in @hbcfield/shared.
   *
   * A request whose person belongs to no workspace gets no verdict rather than a
   * wrong one — the list still renders, that row simply says nothing about cover.
   */
  async assessMany(
    organizationId: string,
    requests: Array<{ id: string; technicianId: string; startDate: Date; endDate: Date }>,
  ): Promise<Map<string, CoverVerdict & { days: CoverDayBrief[] }>> {
    const out = new Map<string, CoverVerdict & { days: CoverDayBrief[] }>();
    if (!requests.length) return out;

    const personIds = [...new Set(requests.map((r) => r.technicianId))];
    const spaceOf = await this.spaceOfEach(organizationId, personIds);
    const spaceIds = [...new Set([...spaceOf.values()])];
    if (!spaceIds.length) return out;

    const spaces = await this.prisma.companyLocation.findMany({
      where: { id: { in: spaceIds }, organizationId },
      select: { id: true, name: true, minCover: true },
    });
    const spaceById = new Map<string, CoverSpace>(
      spaces.map((s) => [s.id, { id: s.id, name: s.name, minCover: s.minCover }]),
    );

    const rosterBySpace = await this.rosters(organizationId, spaceIds);
    const rosterIds = [...new Set([...rosterBySpace.values()].flat().map((p) => p.id))];

    const from = requests.map((r) => CoverService.key(r.startDate)).sort()[0]!;
    const to = requests.map((r) => CoverService.key(r.endDate)).sort().at(-1)!;
    const leave = await this.approvedLeave(rosterIds, from, to);

    for (const req of requests) {
      const spaceId = spaceOf.get(req.technicianId);
      if (!spaceId) continue;
      const space = spaceById.get(spaceId);
      const roster = rosterBySpace.get(spaceId) ?? [];
      const person = roster.find((p) => p.id === req.technicianId);
      if (!space || !person) continue;
      const assessment = assessLeave(
        {
          id: req.id,
          personId: req.technicianId,
          from: CoverService.key(req.startDate),
          to: CoverService.key(req.endDate),
        },
        person,
        space,
        roster,
        leave.filter((l) => roster.some((p) => p.id === l.personId)),
      );
      // The summary AND the day-by-day, because the drawer shows the working
      // out and re-deriving it in the browser would need the whole roster.
      out.set(req.id, { ...verdictOf(assessment), days: daysBrief(assessment) });
    }
    return out;
  }

  /**
   * Cover for every day of a window, per workspace — the wallchart's footer.
   *
   * Computed here rather than in the browser for one reason that outranks
   * performance: the rule lives in one place. A footer that counted rostered
   * people client-side would be a second implementation of `isRosteredOn`, and
   * the day it disagreed with the verdict above it, nobody could say which was
   * right.
   */
  async coverRange(
    organizationId: string,
    from: DateKey,
    to: DateKey,
    scopeSpaceIds?: string[],
  ): Promise<Array<{ spaceId: string; minCover: number; rotaKnown: boolean; days: CoverRangeDay[] }>> {
    if (scopeSpaceIds !== undefined && scopeSpaceIds.length === 0) return [];
    const days = eachDay(from, to, 92);
    if (!days.length) return [];

    const spaces = await this.prisma.companyLocation.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(scopeSpaceIds !== undefined ? { id: { in: scopeSpaceIds } } : {}),
      },
      select: { id: true, minCover: true },
    });
    if (!spaces.length) return [];

    const rosterBySpace = await this.rosters(organizationId, spaces.map((s) => s.id));
    const personIds = [...new Set([...rosterBySpace.values()].flat().map((p) => p.id))];
    const leave = await this.approvedLeave(personIds, from, to);

    return spaces.map((space) => {
      const roster = rosterBySpace.get(space.id) ?? [];
      const mine = leave.filter((l) => roster.some((p) => p.id === l.personId));
      return {
        spaceId: space.id,
        minCover: space.minCover,
        rotaKnown: roster.some(hasRota),
        days: days.map((day) => {
          const c = coverOn(roster, mine, day);
          return { day, rostered: c.rostered.length, working: c.working.length };
        }),
      };
    });
  }

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
    const rosterBySpace = await this.rosters(organizationId, spaceIds);
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
    const dayOfSpace = new Map(
      spaces.map((s) => [s.id, localPartsIn(now, s.timezone || 'Europe/Berlin')]),
    );
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
      const tz = space.timezone || 'Europe/Berlin';
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

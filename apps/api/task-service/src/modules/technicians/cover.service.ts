import { Injectable } from '@nestjs/common';
import {
  zoneOf,
  assessLeave,
  coverOn,
  daysBrief,
  eachDay,
  hasRota,
  isRosteredOn,
  leaveCovers,
  localPartsIn,
  verdictOf,
  type CoverSpace,
  type CoverDayBrief,
  type CoverRangeDay,
  type CoverVerdict,
  type DateKey,
} from '@hbcfield/shared';
import { CoverBase } from './cover.base';

export { shiftRuleOf } from './cover-helpers';

@Injectable()
export class CoverService extends CoverBase {
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

    const from = requests.map((r) => CoverBase.key(r.startDate)).sort()[0]!;
    const to = requests
      .map((r) => CoverBase.key(r.endDate))
      .sort()
      .at(-1)!;
    const rosterBySpace = await this.rosters(organizationId, spaceIds, { from, to });
    const rosterIds = [...new Set([...rosterBySpace.values()].flat().map((p) => p.id))];
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
          from: CoverBase.key(req.startDate),
          to: CoverBase.key(req.endDate),
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

    const rosterBySpace = await this.rosters(
      organizationId,
      spaces.map((s) => s.id),
      { from, to },
    );
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
   * Who in ONE workspace is expected at work today, and who is on approved
   * leave — for a task open to a role (tasks/role-pool.ts).
   *
   * The same rota rules as the floor panel (`isRosteredOn`, `leaveCovers`), on
   * the workspace's own day, so the role offer and the panel never disagree
   * about who is working. Two queries for the roster, one for leave.
   */
  async expectedToday(
    organizationId: string,
    spaceId: string,
    timezone: string | null | undefined,
  ): Promise<Map<string, { rostered: boolean; onLeave: boolean }>> {
    const out = new Map<string, { rostered: boolean; onLeave: boolean }>();
    const today = localPartsIn(new Date(), zoneOf(timezone)).dateStr;
    const roster = (await this.rosters(organizationId, [spaceId], { from: today, to: today })).get(spaceId) ?? [];
    if (!roster.length) return out;
    const leave = await this.approvedLeave(
      roster.map((p) => p.id),
      today,
      today,
    );
    for (const p of roster) {
      out.set(p.id, {
        rostered: isRosteredOn(p, today),
        onLeave: leave.some((l) => l.personId === p.id && leaveCovers(l, today)),
      });
    }
    return out;
  }
}

import { Injectable } from '@nestjs/common';
import {
  countLeave,
  intersectDayRules,
  personRoster,
  type CoverPerson,
  type DayRules,
  type LeaveCount,
  type RosterFn,
} from '@hbcfield/shared';
import { shiftRuleOf } from '../technicians/cover.service';
import { PlaceCalendar } from './calendar-rules-helpers';
import { CalendarRulesBase } from './calendar-rules.base';

export { type PlaceCalendar } from './calendar-rules-helpers';

/**
 * Which days are days off, for a place or a person — the server side of shared calendar/days.ts.
 * Every count (a vacation request, the balance, the manager's drawer) and every shaded calendar day
 * comes through here, so they cannot disagree.
 */
@Injectable()
export class CalendarRulesService extends CalendarRulesBase {

  /**
   * Several people's days at once — the invite dialog asks for up to twenty. A fixed number of
   * queries however many people: their workspaces, their weeks, their rotas, then every place once.
   *
   * Each person is off on a day only when it is off in every place they work (shared
   * intersectDayRules); their own rota/working week sits above that (personRoster). Somebody with
   * a rota that does not reach a day rests on that intersected weekend (`restDows`) — without it a
   * rota starting next month made every weekend a working day.
   */
  async personRulesMany(
    organizationId: string,
    userIds: string[],
    from: string,
    to: string,
  ): Promise<Map<string, { rules: DayRules; roster?: RosterFn; spaceIds: string[] }>> {
    const ids = [...new Set(userIds)];
    const out = new Map<string, { rules: DayRules; roster?: RosterFn; spaceIds: string[] }>();
    if (!ids.length) return out;
    const [spacesOf, users, rotas] = await Promise.all([
      this.workspacesOfMany(organizationId, ids),
      this.prisma.user.findMany({
        where: { id: { in: ids }, organizationId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          specialty: true,
          position: true,
          schedules: { where: { isActive: true }, select: { dayOfWeek: true } },
        },
      }),
      this.prisma.shiftAssignment.findMany({
        where: { organizationId, userId: { in: ids }, isActive: true },
        select: {
          userId: true,
          recurrence: true,
          daysOfWeek: true,
          daysOfMonth: true,
          dates: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      }),
    ]);
    const allSpaces = [...new Set([...spacesOf.values()].flat())];
    const places = await this.places(organizationId, allSpaces, from, to);
    for (const u of users) {
      const spaceIds = spacesOf.get(u.id) ?? [];
      const list = (spaceIds.length ? spaceIds.map((id) => places.get(id)) : [places.get(null)]).filter(Boolean) as PlaceCalendar[];
      const rules = intersectDayRules(list.map((p) => p.rules));
      const person: CoverPerson = {
        id: u.id, firstName: u.firstName, lastName: u.lastName, spaceId: '', specialty: u.specialty, position: u.position,
        scheduleDows: [...new Set(u.schedules.map((x) => x.dayOfWeek))],
        shiftRules: rotas.filter((r) => r.userId === u.id).map(shiftRuleOf),
        restDows: [...rules.weekend],
      };
      out.set(u.id, { rules, roster: personRoster(person), spaceIds });
    }
    return out;
  }

  /** One person's days — `personRulesMany` for one. */
  async personRules(
    organizationId: string,
    userId: string,
    from: string,
    to: string,
  ): Promise<{ rules: DayRules; roster?: RosterFn; spaceIds: string[] }> {
    const r = (await this.personRulesMany(organizationId, [userId], from, to)).get(userId);
    if (r) return r;
    const org = (await this.places(organizationId, [], from, to)).get(null);
    return { rules: org?.rules ?? intersectDayRules([]), spaceIds: [] };
  }

  /** What leave from `from` to `to` costs this person. */
  async countLeaveFor(organizationId: string, userId: string, from: string, to: string): Promise<LeaveCount> {
    const { rules, roster } = await this.personRules(organizationId, userId, from, to);
    return countLeave(from, to, rules, roster);
  }
}

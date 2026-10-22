import { Injectable } from '@nestjs/common';
import {
  countLeave,
  intersectDayRules,
  personRoster,
  type CoverPerson,
  type DayRules,
  type LeaveCount,
  type RosterFn,
  peopleWorkingWeek,
} from '@hbcfield/shared';
import { shiftRuleOf } from '../technicians/cover-helpers';
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
    return (await this.rulesAndPlaces(organizationId, userIds, from, to)).byUser;
  }

  /**
   * `personRulesMany`, also handing back the places it loaded — so a caller that shows them (the
   * calendar's shaded days and holidays) does not load the organization, the workspaces and the
   * holiday overrides a second time. `lang` only names the holidays; the days off are the same.
   */
  private async rulesAndPlaces(
    organizationId: string,
    userIds: string[],
    from: string,
    to: string,
    lang?: string,
  ): Promise<{
    byUser: Map<string, { rules: DayRules; roster?: RosterFn; spaceIds: string[] }>;
    places: Map<string | null, PlaceCalendar> | null;
  }> {
    const ids = [...new Set(userIds)];
    const out = new Map<string, { rules: DayRules; roster?: RosterFn; spaceIds: string[] }>();
    if (!ids.length) return { byUser: out, places: null };
    const [spacesOf, users, rotas] = await Promise.all([
      this.workspacesOfMany(organizationId, ids),
      peopleWorkingWeek(this.prisma, ids, organizationId),
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
    const places = await this.places(organizationId, allSpaces, from, to, lang);
    for (const u of users) {
      const spaceIds = spacesOf.get(u.id) ?? [];
      const list = (spaceIds.length ? spaceIds.map((id) => places.get(id)) : [places.get(null)]).filter(
        Boolean,
      ) as PlaceCalendar[];
      const rules = intersectDayRules(list.map((p) => p.rules));
      const person: CoverPerson = {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        spaceId: '',
        specialty: u.specialty,
        position: u.position,
        scheduleDows: [...new Set(u.schedules.map((x) => x.dayOfWeek))],
        shiftRules: rotas.filter((r) => r.userId === u.id).map(shiftRuleOf),
        restDows: [...rules.weekend],
      };
      out.set(u.id, { rules, roster: personRoster(person), spaceIds });
    }
    return { byUser: out, places };
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

  /**
   * One person's days AND the places they work in, named in `lang` — what the calendar shades. One
   * load of the organization, the workspaces and the overrides instead of two.
   */
  async personRulesWithPlaces(
    organizationId: string,
    userId: string,
    from: string,
    to: string,
    lang?: string,
  ): Promise<{ rules: DayRules; roster?: RosterFn; spaceIds: string[]; places: Map<string | null, PlaceCalendar> }> {
    const { byUser, places } = await this.rulesAndPlaces(organizationId, [userId], from, to, lang);
    const r = byUser.get(userId);
    if (r && places) return { ...r, places };
    const map = places ?? (await this.places(organizationId, [], from, to, lang));
    if (r) return { ...r, places: map };
    return { rules: map.get(null)?.rules ?? intersectDayRules([]), spaceIds: [], places: map };
  }

  /** What leave from `from` to `to` costs this person. */
  async countLeaveFor(organizationId: string, userId: string, from: string, to: string): Promise<LeaveCount> {
    const { rules, roster } = await this.personRules(organizationId, userId, from, to);
    return countLeave(from, to, rules, roster);
  }
}

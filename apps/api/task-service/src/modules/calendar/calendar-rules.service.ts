import { Injectable } from '@nestjs/common';
import {
  notEndedWhere,
  PrismaService,
  countLeave,
  holidayDays,
  intersectDayRules,
  makeDayRules,
  mergeHolidays,
  personRoster,
  resolveHolidayPlace,
  resolveWeekend,
  type CalendarPlace,
  type CoverPerson,
  type DayRules,
  type HolidayOverride,
  type LeaveCount,
  type ResolvedHoliday,
  type RosterFn,
  toISODateString,
} from '@hbcfield/shared';
import { shiftRuleOf } from '../technicians/cover.service';
import { libraryHolidaysForYears } from './holiday-library';

/** One place's calendar: where its holidays come from, its weekend, and what is off in a window. */
export interface PlaceCalendar {
  place: CalendarPlace;
  holidays: ResolvedHoliday[];
  rules: DayRules;
}

type OrgRow = { id: string; name: string; weekendDays: number[]; holidayCountry: string | null; holidayRegion: string | null; country: string | null };
type SpaceRow = { id: string; name: string; weekendDays: number[]; holidayCountry: string | null; holidayRegion: string | null; detectedHolidayCountry?: string | null; detectedHolidayRegion?: string | null };

function yearsOf(from: string, to: string): number[] {
  const a = Number(from.slice(0, 4)), b = Number(to.slice(0, 4));
  const out: number[] = [];
  for (let y = a; y <= Math.min(b, a + 2); y++) out.push(y);
  return out;
}

/**
 * Which days are days off, for a place or a person — the server side of shared calendar/days.ts.
 * Every count (a vacation request, the balance, the manager's drawer) and every shaded calendar day
 * comes through here, so they cannot disagree.
 */
@Injectable()
export class CalendarRulesService {
  constructor(private readonly prisma: PrismaService) {}

  private org(organizationId: string): Promise<OrgRow | null> {
    return this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, weekendDays: true, holidayCountry: true, holidayRegion: true, country: true },
    });
  }
  static orgCountry(o: Pick<OrgRow, 'holidayCountry' | 'country'>): string | null {
    return (o.holidayCountry || o.country || null)?.toUpperCase() ?? null;
  }

  /**
   * Compose one place from rows already in hand. Overrides for library holidays belong to the layer
   * that chose the country (the workspace when it set its own, else the organization); company days
   * from the organization apply everywhere, a workspace's own only there.
   */
  static compose(
    org: OrgRow,
    space: SpaceRow | null,
    overrides: (HolidayOverride & { spaceId: string | null })[],
    from: string,
    to: string,
    lang?: string,
    includeRemoved = false,
  ): PlaceCalendar {
    // Chosen by hand → where the workspace is → the organization (one rule, shared with the screens).
    const resolved = resolveHolidayPlace(org, space);
    const country = resolved.country;
    const region = resolved.region;
    const ownHolidays = !!space && resolved.ownLayer;
    const weekend = resolveWeekend(org.weekendDays, space?.weekendDays);
    const libraryLayer = ownHolidays ? space!.id : null;
    const relevant = overrides.filter((o) =>
      o.libraryKey ? o.spaceId === libraryLayer : o.spaceId === null || (space && o.spaceId === space.id),
    );
    const holidays = mergeHolidays(libraryHolidaysForYears(country, region, yearsOf(from, to), lang), relevant, includeRemoved)
      .filter((h) => h.endDate >= from && h.date <= to);
    return {
      place: {
        spaceId: space?.id ?? null,
        name: space?.name ?? org.name,
        weekend,
        country,
        region,
        inherited: { weekend: !(space?.weekendDays?.length), holidays: resolved.source === 'ORGANIZATION' },
        holidaySource: space ? resolved.source : 'ORGANIZATION',
      },
      holidays,
      rules: makeDayRules(weekend, holidayDays(holidays.filter((h) => !(h as { removed?: boolean }).removed))),
    };
  }

  /** Overrides overlapping a window, for the organization and the given workspaces. One query. */
  private async overrides(organizationId: string, spaceIds: string[], from: string, to: string) {
    const rows = await this.prisma.calendarHoliday.findMany({
      where: {
        organizationId,
        OR: [{ spaceId: null }, ...(spaceIds.length ? [{ spaceId: { in: spaceIds } }] : [])],
        // A moved holiday may have moved INTO the window from a date outside it; library overrides
        // are keyed by year, so take the whole years.
        date: { gte: new Date(`${from.slice(0, 4)}-01-01`), lte: new Date(`${Number(to.slice(0, 4))}-12-31`) },
      },
      select: { id: true, spaceId: true, libraryKey: true, date: true, days: true, name: true, halfDay: true, removed: true, confirmed: true },
    });
    return rows.map((r) => ({ ...r, date: toISODateString(r.date) }));
  }

  /** The organization, or one workspace of it. Null when the workspace is not this org's. */
  async place(organizationId: string, spaceId: string | null, from: string, to: string, lang?: string, includeRemoved = false): Promise<PlaceCalendar | null> {
    const [org, space] = await Promise.all([
      this.org(organizationId),
      spaceId
        ? this.prisma.companyLocation.findFirst({
            where: { id: spaceId, organizationId },
            select: { id: true, name: true, weekendDays: true, holidayCountry: true, holidayRegion: true, detectedHolidayCountry: true, detectedHolidayRegion: true },
          })
        : Promise.resolve(null),
    ]);
    if (!org || (spaceId && !space)) return null;
    const ov = await this.overrides(organizationId, space ? [space.id] : [], from, to);
    return CalendarRulesService.compose(org, space, ov, from, to, lang, includeRemoved);
  }

  /** Several workspaces at once (the calendar's team view, the wallchart). Three queries total. */
  async places(organizationId: string, spaceIds: string[], from: string, to: string, lang?: string): Promise<Map<string | null, PlaceCalendar>> {
    const [org, spaces, ov] = await Promise.all([
      this.org(organizationId),
      spaceIds.length
        ? this.prisma.companyLocation.findMany({
            where: { id: { in: spaceIds }, organizationId },
            select: { id: true, name: true, weekendDays: true, holidayCountry: true, holidayRegion: true, detectedHolidayCountry: true, detectedHolidayRegion: true },
          })
        : Promise.resolve([] as SpaceRow[]),
      this.overrides(organizationId, spaceIds, from, to),
    ]);
    const out = new Map<string | null, PlaceCalendar>();
    if (!org) return out;
    out.set(null, CalendarRulesService.compose(org, null, ov, from, to, lang));
    for (const s of spaces) out.set(s.id, CalendarRulesService.compose(org, s, ov, from, to, lang));
    return out;
  }

  /** The workspaces a person works in right now (not the Remote bucket, not archived). */
  async workspacesOf(organizationId: string, userId: string): Promise<string[]> {
    return (await this.workspacesOfMany(organizationId, [userId])).get(userId) ?? [];
  }

  private async workspacesOfMany(organizationId: string, userIds: string[]): Promise<Map<string, string[]>> {
    const rows = await this.prisma.spaceAssignment.findMany({
      where: {
        organizationId,
        userId: { in: userIds },
        ...notEndedWhere(),
        space: { isActive: true, isRemote: false },
      },
      select: { userId: true, spaceId: true },
    });
    const out = new Map<string, string[]>(userIds.map((id) => [id, []]));
    for (const r of rows) {
      const list = out.get(r.userId)!;
      if (!list.includes(r.spaceId)) list.push(r.spaceId);
    }
    return out;
  }

  /**
   * Several people's days at once — the invite dialog asks for up to twenty. A fixed number of
   * queries however many people: their workspaces, their weeks, their rotas, then every place once.
   *
   * Each person is off on a day only when it is off in every place they work (shared
   * intersectDayRules); their own rota/working week sits above that (personRoster). Somebody with
   * a rota that does not reach a day rests on that intersected weekend (`restDows`) — without it a
   * rota starting next month made every weekend a working day.
   */
  async personRulesMany(organizationId: string, userIds: string[], from: string, to: string): Promise<Map<string, { rules: DayRules; roster?: RosterFn; spaceIds: string[] }>> {
    const ids = [...new Set(userIds)];
    const out = new Map<string, { rules: DayRules; roster?: RosterFn; spaceIds: string[] }>();
    if (!ids.length) return out;
    const [spacesOf, users, rotas] = await Promise.all([
      this.workspacesOfMany(organizationId, ids),
      this.prisma.user.findMany({
        where: { id: { in: ids }, organizationId },
        select: { id: true, firstName: true, lastName: true, specialty: true, position: true, schedules: { where: { isActive: true }, select: { dayOfWeek: true } } },
      }),
      this.prisma.shiftAssignment.findMany({
        where: { organizationId, userId: { in: ids }, isActive: true },
        select: { userId: true, recurrence: true, daysOfWeek: true, daysOfMonth: true, dates: true, effectiveFrom: true, effectiveTo: true },
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
  async personRules(organizationId: string, userId: string, from: string, to: string): Promise<{ rules: DayRules; roster?: RosterFn; spaceIds: string[] }> {
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

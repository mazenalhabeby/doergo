import { Injectable } from '@nestjs/common';
import {
  PrismaService,
  countLeave,
  holidayDays,
  intersectDayRules,
  makeDayRules,
  mergeHolidays,
  personRoster,
  resolveWeekend,
  type CalendarPlace,
  type CoverPerson,
  type DayRules,
  type HolidayOverride,
  type LeaveCount,
  type ResolvedHoliday,
  type RosterFn,
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
type SpaceRow = { id: string; name: string; weekendDays: number[]; holidayCountry: string | null; holidayRegion: string | null };

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

  /**
   * One person with their rota across EVERY workspace — the person layer (shared personRoster).
   * Two queries; null when they are not in the org.
   */
  async personOf(organizationId: string, userId: string): Promise<CoverPerson | null> {
    const [user, rules] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, organizationId },
        select: {
          id: true, firstName: true, lastName: true, specialty: true, position: true,
          schedules: { where: { isActive: true }, select: { dayOfWeek: true } },
        },
      }),
      this.prisma.shiftAssignment.findMany({
        where: { organizationId, userId, isActive: true },
        select: { recurrence: true, daysOfWeek: true, daysOfMonth: true, dates: true, effectiveFrom: true, effectiveTo: true },
      }),
    ]);
    if (!user) return null;
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      spaceId: '',
      specialty: user.specialty,
      position: user.position,
      scheduleDows: [...new Set(user.schedules.map((s) => s.dayOfWeek))],
      shiftRules: rules.map(shiftRuleOf),
    };
  }

  private org(organizationId: string): Promise<OrgRow | null> {
    return this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, weekendDays: true, holidayCountry: true, holidayRegion: true, country: true },
    });
  }

  /** The organization's own holiday source: its holiday country, else its address country. */
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
    const ownHolidays = !!space?.holidayCountry;
    const country = ownHolidays ? space!.holidayCountry!.toUpperCase() : CalendarRulesService.orgCountry(org);
    const region = ownHolidays ? space!.holidayRegion : (org.holidayRegion ?? null);
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
        inherited: { weekend: !(space?.weekendDays?.length), holidays: !ownHolidays },
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
    return rows.map((r) => ({ ...r, date: r.date.toISOString().slice(0, 10) }));
  }

  /** The organization, or one workspace of it. Null when the workspace is not this org's. */
  async place(organizationId: string, spaceId: string | null, from: string, to: string, lang?: string, includeRemoved = false): Promise<PlaceCalendar | null> {
    const [org, space] = await Promise.all([
      this.org(organizationId),
      spaceId
        ? this.prisma.companyLocation.findFirst({
            where: { id: spaceId, organizationId },
            select: { id: true, name: true, weekendDays: true, holidayCountry: true, holidayRegion: true },
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
            select: { id: true, name: true, weekendDays: true, holidayCountry: true, holidayRegion: true },
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
    const rows = await this.prisma.spaceAssignment.findMany({
      where: {
        organizationId,
        userId,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
        space: { isActive: true, isRemote: false },
      },
      select: { spaceId: true },
    });
    return [...new Set(rows.map((r) => r.spaceId))];
  }

  /**
   * One person's days: off only when off in every place they work (shared intersectDayRules), and
   * their own rota/working week above that.
   */
  async personRules(organizationId: string, userId: string, from: string, to: string): Promise<{ rules: DayRules; roster?: RosterFn; spaceIds: string[] }> {
    const [spaceIds, person] = await Promise.all([this.workspacesOf(organizationId, userId), this.personOf(organizationId, userId)]);
    const places = await this.places(organizationId, spaceIds, from, to);
    const list = spaceIds.length ? spaceIds.map((id) => places.get(id)).filter(Boolean) as PlaceCalendar[] : [places.get(null)].filter(Boolean) as PlaceCalendar[];
    return { rules: intersectDayRules(list.map((p) => p.rules)), roster: personRoster(person), spaceIds };
  }

  /** What leave from `from` to `to` costs this person. */
  async countLeaveFor(organizationId: string, userId: string, from: string, to: string): Promise<LeaveCount> {
    const { rules, roster } = await this.personRules(organizationId, userId, from, to);
    return countLeave(from, to, rules, roster);
  }
}

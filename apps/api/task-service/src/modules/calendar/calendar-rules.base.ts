import { Injectable } from '@nestjs/common';
import {
  notEndedWhere,
  PrismaService,
  holidayDays,
  makeDayRules,
  mergeHolidays,
  resolveHolidayPlace,
  resolveWeekend,
  type HolidayOverride,
  toISODateString,
  orgCalendarRules,
} from '@hbcfield/shared';
import { libraryHolidaysForYears } from './holiday-library';
import { PlaceCalendar, OrgRow, SpaceRow, yearsOf } from './calendar-rules-helpers';

/** The organization's and workspaces' day rules — moved here unchanged from calendar-rules.service.ts. */
@Injectable()
export abstract class CalendarRulesBase {
  constructor(protected readonly prisma: PrismaService) {}

  protected org(organizationId: string): Promise<OrgRow | null> {
    return orgCalendarRules(this.prisma, organizationId);
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
    const holidays = mergeHolidays(
      libraryHolidaysForYears(country, region, yearsOf(from, to), lang),
      relevant,
      includeRemoved,
    ).filter((h) => h.endDate >= from && h.date <= to);
    return {
      place: {
        spaceId: space?.id ?? null,
        name: space?.name ?? org.name,
        weekend,
        country,
        region,
        inherited: { weekend: !space?.weekendDays?.length, holidays: resolved.source === 'ORGANIZATION' },
        holidaySource: space ? resolved.source : 'ORGANIZATION',
      },
      holidays,
      rules: makeDayRules(weekend, holidayDays(holidays.filter((h) => !(h as { removed?: boolean }).removed))),
    };
  }

  /** Overrides overlapping a window, for the organization and the given workspaces. One query. */
  protected async overrides(organizationId: string, spaceIds: string[], from: string, to: string) {
    const rows = await this.prisma.calendarHoliday.findMany({
      where: {
        organizationId,
        OR: [{ spaceId: null }, ...(spaceIds.length ? [{ spaceId: { in: spaceIds } }] : [])],
        // A moved holiday may have moved INTO the window from a date outside it; library overrides
        // are keyed by year, so take the whole years.
        date: { gte: new Date(`${from.slice(0, 4)}-01-01`), lte: new Date(`${Number(to.slice(0, 4))}-12-31`) },
      },
      select: {
        id: true,
        spaceId: true,
        libraryKey: true,
        date: true,
        days: true,
        name: true,
        halfDay: true,
        removed: true,
        confirmed: true,
      },
    });
    return rows.map((r) => ({ ...r, date: toISODateString(r.date) }));
  }

  /** The organization, or one workspace of it. Null when the workspace is not this org's. */
  async place(
    organizationId: string,
    spaceId: string | null,
    from: string,
    to: string,
    lang?: string,
    includeRemoved = false,
  ): Promise<PlaceCalendar | null> {
    const [org, space] = await Promise.all([
      this.org(organizationId),
      spaceId
        ? this.prisma.companyLocation.findFirst({
            where: { id: spaceId, organizationId },
            select: {
              id: true,
              name: true,
              weekendDays: true,
              holidayCountry: true,
              holidayRegion: true,
              detectedHolidayCountry: true,
              detectedHolidayRegion: true,
            },
          })
        : Promise.resolve(null),
    ]);
    if (!org || (spaceId && !space)) return null;
    const ov = await this.overrides(organizationId, space ? [space.id] : [], from, to);
    return CalendarRulesBase.compose(org, space, ov, from, to, lang, includeRemoved);
  }

  /** Several workspaces at once (the calendar's team view, the wallchart). Three queries total. */
  async places(
    organizationId: string,
    spaceIds: string[],
    from: string,
    to: string,
    lang?: string,
  ): Promise<Map<string | null, PlaceCalendar>> {
    const [org, spaces, ov] = await Promise.all([
      this.org(organizationId),
      spaceIds.length
        ? this.prisma.companyLocation.findMany({
            where: { id: { in: spaceIds }, organizationId },
            select: {
              id: true,
              name: true,
              weekendDays: true,
              holidayCountry: true,
              holidayRegion: true,
              detectedHolidayCountry: true,
              detectedHolidayRegion: true,
            },
          })
        : Promise.resolve([] as SpaceRow[]),
      this.overrides(organizationId, spaceIds, from, to),
    ]);
    const out = new Map<string | null, PlaceCalendar>();
    if (!org) return out;
    out.set(null, CalendarRulesBase.compose(org, null, ov, from, to, lang));
    for (const s of spaces) out.set(s.id, CalendarRulesBase.compose(org, s, ov, from, to, lang));
    return out;
  }

  /** The workspaces a person works in right now (not the Remote bucket, not archived). */
  async workspacesOf(organizationId: string, userId: string): Promise<string[]> {
    return (await this.workspacesOfMany(organizationId, [userId])).get(userId) ?? [];
  }

  protected async workspacesOfMany(organizationId: string, userIds: string[]): Promise<Map<string, string[]>> {
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
}

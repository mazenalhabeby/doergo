/** The calendar's day rules for a place: its shape, and composing one from rows already in hand. */
import {
  holidayDays,
  makeDayRules,
  mergeHolidays,
  resolveHolidayPlace,
  resolveWeekend,
  type CalendarPlace,
  type DayRules,
  type HolidayOverride,
  type ResolvedHoliday,
} from '@hbcfield/shared';
import { libraryHolidaysForYears } from './holiday-library';

/** One place's calendar: where its holidays come from, its weekend, and what is off in a window. */
export interface PlaceCalendar {
  place: CalendarPlace;
  holidays: ResolvedHoliday[];
  rules: DayRules;
}

type OrgRow = {
  id: string;
  name: string;
  weekendDays: number[];
  holidayCountry: string | null;
  holidayRegion: string | null;
  country: string | null;
};

type SpaceRow = {
  id: string;
  name: string;
  weekendDays: number[];
  holidayCountry: string | null;
  holidayRegion: string | null;
  detectedHolidayCountry?: string | null;
  detectedHolidayRegion?: string | null;
};

function yearsOf(from: string, to: string): number[] {
  const a = Number(from.slice(0, 4)),
    b = Number(to.slice(0, 4));
  const out: number[] = [];
  for (let y = a; y <= Math.min(b, a + 2); y++) out.push(y);
  return out;
}

/** The country an organization's holidays follow: chosen by hand, else where it is registered. */
export function orgHolidayCountry(o: Pick<OrgRow, 'holidayCountry' | 'country'>): string | null {
  return (o.holidayCountry || o.country || null)?.toUpperCase() ?? null;
}

/**
 * Compose one place from rows already in hand. Overrides for library holidays belong to the layer
 * that chose the country (the workspace when it set its own, else the organization); company days
 * from the organization apply everywhere, a workspace's own only there.
 */
export function composePlace(
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

export { OrgRow, SpaceRow, yearsOf };

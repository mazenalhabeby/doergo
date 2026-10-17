/** Module-level helpers of calendar-rules.service.ts — moved here unchanged. */
import { type CalendarPlace, type DayRules, type ResolvedHoliday } from '@hbcfield/shared';

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

export { OrgRow, SpaceRow, yearsOf };

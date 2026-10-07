import { resolveHolidayPlace } from '@hbcfield/shared';
import { CalendarRulesService } from '../calendar-rules.service';
import { matchRegion } from '../holiday-library';

/*
  Where a workspace's public holidays come from: chosen by hand → where it IS → the organization.
  The case that started it: an Austrian office inside a US organization was getting US holidays.
*/

const usOrg = { holidayCountry: null, holidayRegion: null, country: 'US' };
const atOrg = { holidayCountry: null, holidayRegion: null, country: 'AT' };
const blank = { holidayCountry: null, holidayRegion: null, detectedHolidayCountry: null, detectedHolidayRegion: null };

describe('resolveHolidayPlace', () => {
  it('a workspace in another country takes that country, and its own holiday list', () => {
    expect(resolveHolidayPlace(usOrg, { ...blank, detectedHolidayCountry: 'AT', detectedHolidayRegion: '4' }))
      .toEqual({ country: 'AT', region: '4', source: 'LOCATION', ownLayer: true });
  });

  it("a workspace in the organization's country adds its state, and keeps the organization's changes", () => {
    expect(resolveHolidayPlace(usOrg, { ...blank, detectedHolidayCountry: 'US', detectedHolidayRegion: 'NV' }))
      .toEqual({ country: 'US', region: 'NV', source: 'LOCATION', ownLayer: false });
  });

  it('a choice made by hand beats where the workspace is', () => {
    expect(resolveHolidayPlace(usOrg, { holidayCountry: 'US', holidayRegion: null, detectedHolidayCountry: 'AT', detectedHolidayRegion: '4' }))
      .toEqual({ country: 'US', region: null, source: 'CHOSEN', ownLayer: true });
  });

  it("nothing known about the workspace: the organization's choice, else its country", () => {
    expect(resolveHolidayPlace(usOrg, blank)).toEqual({ country: 'US', region: null, source: 'ORGANIZATION', ownLayer: false });
    expect(resolveHolidayPlace({ holidayCountry: 'DE', holidayRegion: 'BY', country: 'AT' }, null))
      .toEqual({ country: 'DE', region: 'BY', source: 'ORGANIZATION', ownLayer: false });
  });

  it("the workspace's own state wins over the organization's state in the same country", () => {
    expect(resolveHolidayPlace({ ...atOrg, holidayRegion: '4' }, { ...blank, detectedHolidayCountry: 'AT', detectedHolidayRegion: '9' }).region).toBe('9');
    // …and with no state detected, the organization's still applies.
    expect(resolveHolidayPlace({ ...atOrg, holidayRegion: '4' }, { ...blank, detectedHolidayCountry: 'AT' }).region).toBe('4');
  });
});

describe('the calendar uses it', () => {
  const org = { id: 'o', name: 'HBC USA', weekendDays: [0, 6], ...usOrg };
  const space = { id: 's', name: 'HBC Office', weekendDays: [], ...blank, detectedHolidayCountry: 'AT', detectedHolidayRegion: '4' };

  it('an Austrian office in a US organization gets Austria’s National Day, not Thanksgiving', () => {
    const p = CalendarRulesService.compose(org, space, [], '2026-10-01', '2026-11-30');
    const days = p.holidays.map((h) => h.date);
    expect(p.place.country).toBe('AT');
    expect(p.place.holidaySource).toBe('LOCATION');
    expect(days).toContain('2026-10-26');
    expect(days).not.toContain('2026-11-26');
  });

  it('an organization-wide change to a holiday still applies to a workspace detected in the same country', () => {
    const nevada = { ...space, detectedHolidayCountry: 'US', detectedHolidayRegion: 'NV' };
    const base = CalendarRulesService.compose(org, nevada, [], '2026-11-01', '2026-11-30');
    const thanksgiving = base.holidays.find((h) => h.date === '2026-11-26')!;
    expect(thanksgiving).toBeTruthy();
    const removedOrgWide = [{ id: 'x', spaceId: null, libraryKey: thanksgiving.key, date: '2026-11-26', days: 1, name: thanksgiving.name, halfDay: false, removed: true, confirmed: false }];
    const after = CalendarRulesService.compose(org, nevada, removedOrgWide, '2026-11-01', '2026-11-30');
    expect(after.holidays.some((h) => h.date === '2026-11-26')).toBe(false);
  });
});

describe('matchRegion — a geocoder’s state to the holiday library’s code', () => {
  it.each([
    ['AT', ['Upper Austria', 'Upper Austria'], '4'],
    ['AT', [null, 'Oberösterreich'], '4'],
    ['US', ['NV', 'Nevada'], 'NV'],
    ['DE', ['BY', 'Bavaria'], 'BY'],
    ['CH', ['ZH', 'Zürich'], 'ZH'],
    ['GB', [null, 'England'], 'ENG'],
  ] as [string, (string | null)[], string][])('%s %j → %s', (country, names, code) => {
    expect(matchRegion(country, names)).toBe(code);
  });

  it('no match keeps the country alone, and an unknown country is refused', () => {
    expect(matchRegion('AT', ['Atlantis'])).toBeNull();
    expect(matchRegion('XX', ['NV'])).toBeNull();
    expect(matchRegion('at', ['NV'])).toBeNull();
  });
});

import { countLeave, dayKind, intersectDayRules, makeDayRules, personRoster, type HolidayDay } from '../days';
import type { CoverPerson } from '../../attendance/cover';

const xmas = (halfDay = false): HolidayDay => ({
  day: '2026-12-25',
  key: 'xmas',
  name: 'Christmas Day',
  kind: 'PUBLIC',
  halfDay,
  estimated: false,
});

const vienna = makeDayRules([6, 0], [xmas()]);
const riyadh = makeDayRules([5, 6], []);

describe('intersectDayRules — decided per day', () => {
  it('Fri 25 Dec is off in both (Vienna holiday, Riyadh weekend): costs nothing', () => {
    const both = intersectDayRules([vienna, riyadh]);
    expect(dayKind('2026-12-25', both)).toBe('holiday');
    const c = countLeave('2026-12-25', '2026-12-25', both);
    expect(c.counted).toBe(0);
    expect(c.holidays.map((h) => h.name)).toEqual(['Christmas Day']);
  });

  it('a day working in either place still costs a day', () => {
    const both = intersectDayRules([vienna, riyadh]);
    expect(dayKind('2027-01-01', both)).toBe('work'); // Fri, working in Vienna
    expect(dayKind('2027-01-03', both)).toBe('work'); // Sun, working in Riyadh
    expect(dayKind('2027-01-02', both)).toBe('weekend'); // Sat, off in both
  });

  it('half only when the best case is half', () => {
    const halfHere = makeDayRules([6, 0], [xmas(true)]);
    const fullThere = makeDayRules([6, 0], [xmas()]);
    expect(dayKind('2026-12-25', intersectDayRules([halfHere, fullThere]))).toBe('half-holiday');
    expect(countLeave('2026-12-25', '2026-12-25', intersectDayRules([halfHere, riyadh])).counted).toBe(0.5);
    const plain = makeDayRules([6, 0], []);
    expect(countLeave('2026-12-25', '2026-12-25', intersectDayRules([halfHere, plain])).counted).toBe(1);
  });

  it('a rota that does not reach a day leaves it to the places, day by day', () => {
    const p = {
      id: 'u',
      firstName: 'A',
      lastName: 'B',
      spaceId: '',
      scheduleDows: [],
      shiftRules: [
        { recurrence: 'DAILY', daysOfWeek: [], daysOfMonth: [], dates: [], effectiveFrom: '2027-02-01', effectiveTo: null },
      ],
    } as unknown as CoverPerson;
    const roster = personRoster(p);
    expect(roster?.('2026-12-25')).toBeUndefined();
    expect(countLeave('2026-12-25', '2026-12-25', intersectDayRules([vienna, riyadh]), roster).counted).toBe(0);
    expect(roster?.('2027-02-05')).toBe(true);
  });
});

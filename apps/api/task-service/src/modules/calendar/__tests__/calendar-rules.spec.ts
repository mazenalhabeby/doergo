import {
  buildIcs,
  countLeave,
  findFreeSlots,
  firstReminder,
  holidayDays,
  intersectDayRules,
  isEstimatedRule,
  isRosteredOn,
  makeDayRules,
  mergeHolidays,
  nextReminder,
  occurrences,
  parseRepeat,
  parseReminderOffsets,
  parseWeekendDays,
  personRoster,
  repeatToRrule,
  resolveWeekend,
  ruleDurationDays,
  type CoverPerson,
  type LibraryHoliday,
} from '@hbcfield/shared';
import { libraryHolidays } from '../holiday-library';

/*
  The calendar's rules (packages/shared/src/calendar). Pure: every surface that counts leave or
  shades a day calls these, so a scenario here is the product's answer everywhere.
*/

const person = (over: Partial<CoverPerson> = {}): CoverPerson => ({
  id: 'p', firstName: 'A', lastName: 'B', spaceId: 's', specialty: null, position: null, scheduleDows: [], shiftRules: [], ...over,
});

describe('weekends', () => {
  it('a workspace weekend beats the organization; empty inherits; nothing set is Sat+Sun', () => {
    expect(resolveWeekend([0, 6], [5, 6])).toEqual([5, 6]);
    expect(resolveWeekend([5], [])).toEqual([5]);
    expect(resolveWeekend(null, null).sort()).toEqual([0, 6]);
  });

  it('refuses a seven-day weekend and nonsense, never repairs it', () => {
    expect(parseWeekendDays([0, 1, 2, 3, 4, 5, 6])).toBeNull();
    expect(parseWeekendDays([7])).toBeNull();
    expect(parseWeekendDays(['6'])).toBeNull();
    expect(parseWeekendDays([6, 5, 5])).toEqual([5, 6]);
  });
});

describe('counting leave', () => {
  const at = makeDayRules([0, 6], [
    { day: '2026-10-26', key: 'k', name: 'Nationalfeiertag', kind: 'PUBLIC', halfDay: false, estimated: false },
  ]);

  it('the mockup: Oct 12–26 is 15 calendar days and 10 counted (4 weekend days, 1 holiday)', () => {
    const c = countLeave('2026-10-12', '2026-10-26', at);
    expect(c.calendarDays).toBe(15);
    expect(c.restDays).toBe(4);
    expect(c.holidays.map((h) => h.day)).toEqual(['2026-10-26']);
    expect(c.counted).toBe(10);
  });

  it('a Friday+Saturday workspace counts Sunday as a working day', () => {
    const riyadh = makeDayRules([5, 6], []);
    // Thu 29 Oct → Sun 1 Nov: Thu, Sun work; Fri, Sat rest.
    expect(countLeave('2026-10-29', '2026-11-01', riyadh).counted).toBe(2);
  });

  it('a half holiday costs half a day', () => {
    const r = makeDayRules([0, 6], [{ day: '2026-12-24', key: 'x', name: 'Christmas Eve', kind: 'COMPANY', halfDay: true, estimated: false }]);
    expect(countLeave('2026-12-24', '2026-12-24', r).counted).toBe(0.5);
  });

  it('a holiday on a weekend costs nothing twice — it is simply a rest day', () => {
    const r = makeDayRules([0, 6], [{ day: '2026-11-01', key: 'x', name: 'All Saints', kind: 'PUBLIC', halfDay: false, estimated: false }]);
    const c = countLeave('2026-11-01', '2026-11-01', r);
    expect(c.counted).toBe(0);
    expect(c.holidays).toEqual([]);
  });

  it('splits a request over New Year by year', () => {
    const c = countLeave('2026-12-28', '2027-01-08', makeDayRules([0, 6], []));
    expect(c.byYear).toEqual({ '2026': 4, '2027': 6 });
  });

  it('the person\'s own week beats the workspace weekend (works Sun–Thu)', () => {
    const p = person({ scheduleDows: [0, 1, 2, 3, 4] });
    // Fri 30 Oct – Sun 1 Nov: only Sunday is theirs.
    expect(countLeave('2026-10-30', '2026-11-01', makeDayRules([0, 6], []), personRoster(p)).counted).toBe(1);
  });

  it('somebody with no rota follows the workspace weekend', () => {
    expect(personRoster(person())).toBeUndefined();
  });

  it('two workspaces: a day is off only if it is off in both', () => {
    const r = intersectDayRules([makeDayRules([0, 6], []), makeDayRules([5, 6], [])]);
    expect([...r.weekend]).toEqual([6]);
  });
});

describe('cover respects the calendar for people without a rota', () => {
  it('rests on the workspace weekend, and nobody is rostered on a holiday', () => {
    const p = person({ restDows: [0, 6], closedDays: ['2026-10-26'] });
    expect(isRosteredOn(p, '2026-10-31')).toBe(false); // Saturday
    expect(isRosteredOn(p, '2026-10-26')).toBe(false); // holiday
    expect(isRosteredOn(p, '2026-10-27')).toBe(true);
  });

  it('without a weekend known, every day still counts (never "we were never told" → off)', () => {
    expect(isRosteredOn(person(), '2026-10-31')).toBe(true);
  });

  it('a rota shift on a holiday still counts', () => {
    const p = person({
      closedDays: ['2026-10-26'],
      shiftRules: [{ recurrence: 'ONE_OFF', daysOfWeek: [], daysOfMonth: [], dates: ['2026-10-26'], effectiveFrom: '2026-01-01', effectiveTo: null }],
    });
    expect(isRosteredOn(p, '2026-10-26')).toBe(true);
  });
});

describe('holidays', () => {
  const lib: LibraryHoliday[] = [
    { key: '2026:30 ramadan p4d', date: '2026-03-19', days: 4, name: 'Eid al-Fitr', estimated: true },
    { key: '2026:09-23', date: '2026-09-23', days: 1, name: 'National Day', estimated: false },
  ];

  it('flags moon-sighted rules as estimates and reads their length', () => {
    expect(isEstimatedRule('9 Dhu al-Hijjah P4D')).toBe(true);
    expect(isEstimatedRule('easter 1')).toBe(false);
    expect(ruleDurationDays('30 Ramadan P4D')).toBe(4);
    expect(ruleDurationDays('P99D')).toBe(14);
  });

  it('confirmed and moved Eid, a removed holiday, a company day', () => {
    const list = mergeHolidays(lib, [
      { id: 'o1', libraryKey: '2026:30 ramadan p4d', date: '2026-03-20', days: 3, name: '', halfDay: false, removed: false, confirmed: true },
      { id: 'o2', libraryKey: '2026:09-23', date: '2026-09-23', days: 1, name: 'x', halfDay: false, removed: true, confirmed: false },
      { id: 'c1', libraryKey: null, date: '2026-12-24', days: 1, name: 'Company day', halfDay: true, removed: false, confirmed: true },
    ]);
    expect(list.map((h) => [h.name, h.date, h.endDate, h.status])).toEqual([
      ['Eid al-Fitr', '2026-03-20', '2026-03-22', 'CONFIRMED'],
      ['Company day', '2026-12-24', '2026-12-24', 'FIXED'],
    ]);
    expect(holidayDays(list).length).toBe(4);
  });

  it('a removed holiday is still listed for the settings screen, so it can be restored', () => {
    const list = mergeHolidays(lib, [{ id: 'o2', libraryKey: '2026:09-23', date: '2026-09-23', days: 1, name: 'x', halfDay: false, removed: true, confirmed: false }], true);
    expect(list.find((h) => h.date === '2026-09-23')).toMatchObject({ removed: true });
  });

  it('the library: Austria has National Day; Saudi Eid is estimated and four days', () => {
    const at = libraryHolidays('AT', null, 2026);
    expect(at.some((h) => h.date === '2026-10-26')).toBe(true);
    const sa = libraryHolidays('SA', null, 2026);
    const eid = sa.find((h) => h.estimated && h.days === 4);
    expect(eid).toBeDefined();
    expect(libraryHolidays('ZZ', null, 2026)).toEqual([]);
    expect(libraryHolidays('at; drop', null, 2026)).toEqual([]);
  });
});

describe('repeating events', () => {
  const start = new Date('2026-10-26T08:00:00Z'); // 09:00 Vienna (CET)

  it('weekly on Mon/Wed keeps the wall time across the clock change', () => {
    const r = parseRepeat({ freq: 'WEEKLY', interval: 1, byDay: [1, 3] })!;
    const list = occurrences(start, 3600000, r, 'Europe/Vienna', new Date('2026-10-20T00:00:00Z'), new Date('2026-11-05T00:00:00Z'));
    expect(list.map((d) => d.toISOString())).toEqual([
      '2026-10-26T08:00:00.000Z', '2026-10-28T08:00:00.000Z', '2026-11-02T08:00:00.000Z', '2026-11-04T08:00:00.000Z',
    ]);
  });

  it('stops after its count, skips a missing 31st, and refuses an unbounded shape', () => {
    expect(occurrences(start, 1, { freq: 'DAILY', interval: 1, count: 3 }, 'UTC', start, new Date('2027-01-01')).length).toBe(3);
    const jan31 = new Date('2026-01-31T10:00:00Z');
    const m = occurrences(jan31, 1, { freq: 'MONTHLY', interval: 1 }, 'UTC', jan31, new Date('2026-06-01'));
    expect(m.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
    expect(() => parseRepeat({ freq: 'HOURLY' })).toThrow();
    expect(() => parseRepeat({ freq: 'DAILY', count: 100000 })).toThrow();
  });

  it('turns into an RRULE for the feed', () => {
    expect(repeatToRrule({ freq: 'WEEKLY', interval: 2, byDay: [1, 3], until: '2026-12-31' })).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231T235959Z');
  });
});

describe('reminders', () => {
  const ev = { startAt: new Date('2026-10-27T14:00:00Z'), endAt: new Date('2026-10-27T14:30:00Z'), repeat: null, timezone: 'UTC', offsets: [1440, 10] };

  it('fires each offset in turn, then nothing', () => {
    const a = nextReminder(ev, new Date('2026-10-26T00:00:00Z'))!;
    expect(a.at.toISOString()).toBe('2026-10-26T14:00:00.000Z');
    const b = nextReminder(ev, a.at)!;
    expect(b.at.toISOString()).toBe('2026-10-27T13:50:00.000Z');
    expect(nextReminder(ev, b.at)).toBeNull();
  });

  it('saved five minutes before with a 10-minute reminder: rings now, not never', () => {
    const now = new Date('2026-10-27T13:55:00Z');
    const r = firstReminder({ ...ev, offsets: [10] }, now)!;
    expect(r.at.getTime()).toBe(now.getTime());
  });

  it('"Done" skips the rest of that occurrence and moves to the next one', () => {
    const daily = { ...ev, offsets: [10, 0], repeat: { freq: 'DAILY' as const, interval: 1 } };
    const r = nextReminder(daily, new Date('2026-10-27T13:51:00Z'), new Date('2026-10-27T14:00:00Z'))!;
    expect(r.occurrence.toISOString()).toBe('2026-10-28T14:00:00.000Z');
  });

  it('only the offsets on the menu, at most five', () => {
    expect(parseReminderOffsets([10, 1440])).toEqual([1440, 10]);
    expect(() => parseReminderOffsets([7])).toThrow();
    expect(() => parseReminderOffsets([0, 5, 10, 15, 30, 60])).toThrow();
  });
});

describe('the feed document', () => {
  it('escapes what people typed and folds long lines', () => {
    const ics = buildIcs('Org', [{ uid: 'u1', title: 'A, B; C\\nD', start: '2026-10-26', end: '2026-10-27', allDay: true, description: 'x'.repeat(200) }]);
    expect(ics).toContain('SUMMARY:A\\, B\\; C\\\\nD');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(buildIcs('Org', [{ uid: 'u', title: 't', start: new Date(), end: new Date(), allDay: false, url: 'javascript:alert(1)' }])).not.toContain('URL:');
  });
});

describe('finding a time', () => {
  it('skips a busy hour and a day off, and spreads suggestions out', () => {
    const slots = findFreeSlots({
      people: [
        { busy: [{ start: new Date('2026-10-27T08:00:00Z'), end: new Date('2026-10-27T09:00:00Z') }], works: () => true },
        { busy: [], works: (d) => d !== '2026-10-28' },
      ],
      timezone: 'UTC', durationMin: 30, from: new Date('2026-10-27T07:00:00Z'), days: 3, dayStart: '08:00', dayEnd: '10:00',
    });
    expect(slots.map((s) => s.start.toISOString())).toEqual(['2026-10-27T09:00:00.000Z', '2026-10-29T08:00:00.000Z', '2026-10-29T09:30:00.000Z']);
  });
});

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  assessLeave,
  tradeOf,
  coverOn,
  eachDay,
  floorStatus,
  isRosteredOn,
  type CoverLeave,
  type CoverPerson,
  type CoverSpace,
} from '@hbcfield/shared';

/**
 * Will there be enough people, and the right people.
 *
 * These are the rules the wallchart footer, the approval verdict and the live
 * floor panel all read. They are pinned here rather than through the service
 * because they are pure: a scenario is six lines, and every one of them is a
 * decision somebody argued about.
 */

const person = (over: Partial<CoverPerson> & { id: string }): CoverPerson => ({
  firstName: over.id, lastName: 'X', spaceId: 's1',
  specialty: null, position: null, scheduleDows: [], shiftRules: [],
  ...over,
});

const WEEKDAYS = [1, 2, 3, 4, 5];
const space: CoverSpace = { id: 's1', name: 'Warehouse', minCover: 3 };

// 2026-09-14 is a Monday; 2026-09-19 a Saturday.
const MON = '2026-09-14', TUE = '2026-09-15', SAT = '2026-09-19';

describe('who is rostered', () => {
  it('follows the weekly schedule when there is one', () => {
    const p = person({ id: 'mike', scheduleDows: WEEKDAYS });
    expect(isRosteredOn(p, MON)).toBe(true);
    expect(isRosteredOn(p, SAT)).toBe(false);
  });

  it('follows the rota when there is one, and the rota wins over the schedule', () => {
    const p = person({
      id: 'noor',
      scheduleDows: WEEKDAYS,
      shiftRules: [{ recurrence: 'WEEKLY', daysOfWeek: [6], daysOfMonth: [], dates: [], effectiveFrom: '2026-01-01', effectiveTo: null }],
    });
    expect(isRosteredOn(p, SAT)).toBe(true);
    expect(isRosteredOn(p, MON)).toBe(false);
  });

  /*
    Found on real data, and the reason the precedence is per DAY.

    A member with a Mon–Fri week and a rota effective from 5 September had an
    August leave request assessed over ZERO days — the old rule said "has a
    rota, therefore the weekly schedule is irrelevant", which blanked out a week
    that was genuinely in force on the dates being asked about. The request then
    silently carried no verdict at all.
  */
  it('falls back to the weekly week on days the rota does not yet reach', () => {
    const p = person({
      id: 'noor',
      scheduleDows: WEEKDAYS,
      shiftRules: [{ recurrence: 'DAILY', daysOfWeek: [], daysOfMonth: [], dates: [], effectiveFrom: '2026-10-01', effectiveTo: null }],
    });
    expect(isRosteredOn(p, MON)).toBe(true);   // September: the week still rules
    expect(isRosteredOn(p, SAT)).toBe(false);  // …including its days off
    expect(isRosteredOn(p, '2026-10-03')).toBe(true); // October: the rota rules, and it is DAILY
  });

  it('falls back to the weekly week again after a rota has ended', () => {
    const p = person({
      id: 'ex',
      scheduleDows: WEEKDAYS,
      shiftRules: [{ recurrence: 'WEEKLY', daysOfWeek: [6], daysOfMonth: [], dates: [], effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' }],
    });
    expect(isRosteredOn(p, MON)).toBe(true);
    expect(isRosteredOn(p, SAT)).toBe(false);
  });

  it('a rota in force but excluding the day still beats the weekly week', () => {
    const p = person({
      id: 'sat-only',
      scheduleDows: WEEKDAYS,
      shiftRules: [{ recurrence: 'WEEKLY', daysOfWeek: [6], daysOfMonth: [], dates: [], effectiveFrom: '2026-01-01', effectiveTo: null }],
    });
    expect(isRosteredOn(p, SAT)).toBe(true);
    expect(isRosteredOn(p, MON)).toBe(false);
  });

  /*
    An expired rota and NO weekly week leaves nothing configured for that day,
    which is the "we were never told" case — counted, not assumed absent.
  */
  it('treats an expired rota with no weekly week as nothing configured', () => {
    const p = person({
      id: 'old',
      shiftRules: [{ recurrence: 'DAILY', daysOfWeek: [], daysOfMonth: [], dates: [], effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' }],
    });
    expect(isRosteredOn(p, MON)).toBe(true);
  });

  /*
    The branch that decides whether this feature works at all in a real
    organization. Most never fill in a working week, and reading "we were never
    told" as "they are off" would report zero cover everywhere and make every
    verdict a lie.
  */
  it('counts somebody with NO rota at all, rather than assuming they are off', () => {
    expect(isRosteredOn(person({ id: 'unknown' }), MON)).toBe(true);
    expect(isRosteredOn(person({ id: 'unknown' }), SAT)).toBe(true);
  });

  it('reads the weekday from the date key, not from the server’s timezone', () => {
    // Would flip a day either side of UTC if this went through local time.
    expect(isRosteredOn(person({ id: 'p', scheduleDows: [1] }), MON)).toBe(true);
    expect(isRosteredOn(person({ id: 'p', scheduleDows: [0] }), MON)).toBe(false);
  });
});

describe('cover on a day', () => {
  const roster = ['a', 'b', 'c'].map((id) => person({ id, scheduleDows: WEEKDAYS }));

  it('subtracts approved leave', () => {
    const leave: CoverLeave[] = [{ id: 'l1', personId: 'a', from: MON, to: TUE }];
    expect(coverOn(roster, leave, MON).working.map((p) => p.id)).toEqual(['b', 'c']);
  });

  it('answers the counterfactual through the same path as the present tense', () => {
    const pending: CoverLeave = { id: 'l2', personId: 'b', from: MON, to: MON };
    expect(coverOn(roster, [], MON).working).toHaveLength(3);
    expect(coverOn(roster, [], MON, pending).working).toHaveLength(2);
  });
});

describe('what approving would do', () => {
  const roster = [
    person({ id: 'mike',  specialty: 'General', scheduleDows: WEEKDAYS }),
    person({ id: 'sarah', specialty: 'General', scheduleDows: WEEKDAYS }),
    person({ id: 'david', specialty: 'General', scheduleDows: WEEKDAYS }),
    person({ id: 'karim', specialty: 'HVAC',    scheduleDows: WEEKDAYS }),
  ];
  const req = (id: string, from: string, to: string) => ({ id: 'r1', personId: id, from, to });

  it('is fine when the floor still holds with room to spare', () => {
    const a = assessLeave(req('mike', MON, MON), roster[0]!, { ...space, minCover: 2 }, roster, []);
    expect(a.worst).toBe(3);
    expect(a.level).toBe('ok');
  });

  /*
    Landing exactly ON the floor is its own answer, not a pass. Nothing is
    broken, and there is no slack left either — one sick day and the workspace
    is short. Collapsing this into 'ok' hides the last warning a manager gets.
  */
  it('is tight when approving lands exactly ON the floor', () => {
    const a = assessLeave(req('mike', MON, MON), roster[0]!, { ...space, minCover: 3 }, roster, []);
    expect(a.worst).toBe(3);
    expect(a.level).toBe('tight');
  });

  it('is short when somebody is already off that week', () => {
    const already: CoverLeave[] = [{ id: 'l1', personId: 'david', from: MON, to: TUE }];
    const a = assessLeave(req('mike', MON, TUE), roster[0]!, space, roster, already);
    expect(a.level).toBe('short');
    expect(a.worst).toBe(2);
    expect(a.breachDays).toBe(2);
  });

  /*
    The case a headcount cannot see, and the reason this product can. Four people
    become three — comfortably above a floor of three — and the workspace still
    has nobody who can touch a heat pump.
  */
  it('is critical on SKILL even when the headcount is comfortable', () => {
    const a = assessLeave(req('karim', MON, TUE), roster[3]!, space, roster, []);
    expect(a.level).toBe('skill');
    expect(a.worst).toBe(3);
    expect(a.breachDays).toBe(0);
    expect(a.skill).toBe('HVAC');
  });

  /*
    Found on real data: `specialty` is NULL for every one of 29 employees and the
    trade lives in `position`. Reading specialty alone silently disabled the one
    verdict a headcount cannot produce.
  */
  it('reads the trade from position when specialty was never filled in', () => {
    const crew = [
      person({ id: 'a', position: 'Electrician', scheduleDows: WEEKDAYS }),
      person({ id: 'b', position: 'Electrician', scheduleDows: WEEKDAYS }),
      person({ id: 'c', position: 'HVAC Specialist', scheduleDows: WEEKDAYS }),
    ];
    const a = assessLeave(req('c', MON, MON), crew[2]!, { ...space, minCover: 1 }, crew, []);
    expect(a.level).toBe('skill');
    expect(a.skill).toBe('HVAC Specialist');
  });

  it('prefers specialty over position when both are set', () => {
    const crew = [
      person({ id: 'a', specialty: 'Gas', position: 'Plumber', scheduleDows: WEEKDAYS }),
      person({ id: 'b', specialty: 'Water', position: 'Plumber', scheduleDows: WEEKDAYS }),
    ];
    // Same position, different specialty → the specialist is still irreplaceable.
    const a = assessLeave(req('a', MON, MON), crew[0]!, { ...space, minCover: 1 }, crew, []);
    expect(a.level).toBe('skill');
    expect(a.skill).toBe('Gas');
  });

  it('matches a trade case-insensitively — it is text a human typed twice', () => {
    const crew = [
      person({ id: 'a', position: 'electrician', scheduleDows: WEEKDAYS }),
      person({ id: 'b', position: 'Electrician', scheduleDows: WEEKDAYS }),
    ];
    // No floor, so a headcount verdict cannot mask what is being tested here.
    const a = assessLeave(req('a', MON, MON), crew[0]!, { ...space, minCover: 0 }, crew, []);
    expect(a.level).toBe('ok');
  });

  it('passes no skill verdict when nobody has a trade recorded at all', () => {
    const crew = [person({ id: 'a', scheduleDows: WEEKDAYS }), person({ id: 'b', scheduleDows: WEEKDAYS })];
    const a = assessLeave(req('a', MON, MON), crew[0]!, { ...space, minCover: 0 }, crew, []);
    expect(a.level).toBe('ok');
  });

  it('a missing trade outranks a comfortable count, never the other way round', () => {
    const already: CoverLeave[] = [{ id: 'l1', personId: 'david', from: MON, to: MON }];
    const a = assessLeave(req('karim', MON, MON), roster[3]!, space, roster, already);
    expect(a.level).toBe('skill');
  });

  it('skips days the person was not rostered anyway', () => {
    // Fri→Mon: the weekend costs no cover and must not be counted as a loss.
    const a = assessLeave(req('mike', '2026-09-18', '2026-09-21'), roster[0]!, space, roster, []);
    expect(a.days.map((d) => d.day)).toEqual(['2026-09-18', '2026-09-21']);
  });

  it('passes no verdict when the workspace has no floor set', () => {
    const already: CoverLeave[] = [{ id: 'l1', personId: 'david', from: MON, to: MON }];
    const a = assessLeave(req('mike', MON, MON), roster[0]!, { ...space, minCover: 0 }, roster, already);
    expect(a.level).toBe('ok');
    expect(a.breachDays).toBe(0);
  });

  /*
    Re-assessing a request that is already approved must not count it twice —
    otherwise re-opening an approved row shows the workspace one person worse
    off than it is, and the number disagrees with the chart beside it.
  */
  it('never counts the request against itself', () => {
    const self: CoverLeave[] = [{ id: 'r1', personId: 'mike', from: MON, to: MON }];
    const a = assessLeave(req('mike', MON, MON), roster[0]!, space, roster, self);
    expect(a.worst).toBe(3);
  });

  it('reports whether a rota is known at all, so a screen can say so', () => {
    const headcountOnly = ['a', 'b'].map((id) => person({ id }));
    const a = assessLeave(req('a', MON, MON), headcountOnly[0]!, space, headcountOnly, []);
    expect(a.rotaKnown).toBe(false);
  });
});

describe('what somebody does', () => {
  it('falls back to position, and reports nothing when neither is set', () => {
    expect(tradeOf({ specialty: 'HVAC', position: 'Technician' })).toBe('HVAC');
    expect(tradeOf({ specialty: null, position: 'Plumber' })).toBe('Plumber');
    expect(tradeOf({ specialty: null, position: null })).toBeNull();
    expect(tradeOf({ specialty: '  ', position: '' })).toBeNull();
  });
});

describe('the live floor', () => {
  it('calls 0 minCover “no floor”, never “nobody needed”', () => {
    expect(floorStatus(0, 0)).toBe('ok');
  });
  it('separates at-the-floor from under it', () => {
    expect(floorStatus(3, 3)).toBe('tight');
    expect(floorStatus(2, 3)).toBe('short');
    expect(floorStatus(4, 3)).toBe('ok');
  });
});

/*
  Who is allowed to SEE a cover projection.

  The leave list is gated on `canViewAllTasks`, which the €2 External Observer
  seat holds. Staffing levels are not the work, so the gateway decides whether
  the caller may have the projection and says so explicitly. An absent flag must
  mean NO — a payload that leaks by omission is the wrong default.
*/
describe('cover is attached only when the gateway said so', () => {
  it('treats a missing withCover flag as no', () => {
    const src = readFileSync(join(__dirname, '..', 'technicians.service.ts'), 'utf8');
    expect(src).toContain('dto.withCover === true');
    // …and the assessment is skipped entirely, so it is not merely hidden.
    expect(src).toContain('withCover ? timeOffs.filter');
  });
});

describe('day expansion', () => {
  it('is inclusive at both ends', () => {
    expect(eachDay('2026-09-14', '2026-09-16')).toEqual(['2026-09-14', '2026-09-15', '2026-09-16']);
  });
  it('crosses a month boundary', () => {
    expect(eachDay('2026-09-30', '2026-10-01')).toEqual(['2026-09-30', '2026-10-01']);
  });
  it('is bounded, so a bad range cannot spin', () => {
    expect(eachDay('2026-01-01', '2099-01-01').length).toBe(366);
  });
});

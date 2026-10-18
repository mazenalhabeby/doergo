import {
  arrivalFlags,
  chooseShiftInstance,
  judgePosition,
  lateFromRest,
  plannedRestMinutes,
  readLabelFacts,
  restFlags,
  withClosing,
  withExpectedEnd,
} from '@hbcfield/shared';

/** The shared label rules (packages/shared/src/attendance/labels), one case per situation in the plan. */
const d = (iso: string) => new Date(iso);
const inst = (start: string, end: string, tol = 10) => ({
  expectedClockInAt: d(start),
  expectedClockOutAt: d(end),
  toleranceMin: tol,
});

describe('label rules — which shift instance', () => {
  const am = inst('2026-10-13T06:00:00Z', '2026-10-13T10:00:00Z');
  const pm = inst('2026-10-13T11:00:00Z', '2026-10-13T15:00:00Z');
  it('the instance the clock-in falls in', () => {
    expect(chooseShiftInstance([am, pm], d('2026-10-13T08:00:00Z'))).toBe(am);
    expect(chooseShiftInstance([am, pm], d('2026-10-13T12:00:00Z'))).toBe(pm);
  });
  it('early for the next one, even with the last one just ended', () => {
    expect(chooseShiftInstance([am, pm], d('2026-10-13T10:05:00Z'))).toBe(pm);
  });
  it('just after the end with nothing coming soon: the one that ended', () => {
    const evening = inst('2026-10-13T16:00:00Z', '2026-10-13T20:00:00Z');
    expect(chooseShiftInstance([am, evening], d('2026-10-13T10:05:00Z'))).toBe(am);
  });
  it('early before the only shift', () => {
    expect(chooseShiftInstance([am], d('2026-10-13T05:30:00Z'))).toBe(am);
  });
  it('a daylight-saving night (25 h day) keeps its instance', () => {
    const night = inst('2026-10-24T20:00:00Z', '2026-10-25T05:00:00Z');
    expect(chooseShiftInstance([night], d('2026-10-25T02:30:00Z'))).toBe(night);
  });
});

describe('label rules — late on arrival', () => {
  const start = d('2026-10-13T06:00:00Z');
  it.each([
    ['early', '2026-10-13T05:50:00Z', []],
    ['on time', '2026-10-13T06:00:00Z', []],
    ['within grace', '2026-10-13T06:10:00Z', []],
    ['late', '2026-10-13T06:11:00Z', ['LATE_ARRIVAL']],
  ])('%s', (_name, clockIn, flags) => {
    expect(
      arrivalFlags({ firstOfShift: true, clockInAt: d(clockIn), expectedClockInAt: start, toleranceMin: 10 }),
    ).toEqual(flags);
  });
  it('a second entry of the shift is never late', () => {
    expect(
      arrivalFlags({
        firstOfShift: false,
        clockInAt: d('2026-10-13T11:00:00Z'),
        expectedClockInAt: start,
        toleranceMin: 10,
      }),
    ).toEqual([]);
  });
  it('no shift: nothing to be late for', () => {
    expect(
      arrivalFlags({
        firstOfShift: true,
        clockInAt: d('2026-10-13T11:00:00Z'),
        expectedClockInAt: null,
        toleranceMin: 10,
      }),
    ).toEqual([]);
  });
});

describe('label rules — back from rest', () => {
  const out = d('2026-10-13T10:00:00Z');
  it('planned 30, took 48 with 10 grace → 8 over, flagged', () => {
    const r = lateFromRest({ plannedMin: 30, startedAt: out, endedAt: d('2026-10-13T10:48:00Z'), toleranceMin: 10 });
    expect(r).toEqual({ plannedMin: 30, takenMin: 48, overMin: 8 });
    expect(restFlags(r)).toEqual(['LATE_FROM_REST']);
  });
  it('within planned + grace: not flagged', () => {
    expect(
      restFlags(lateFromRest({ plannedMin: 30, startedAt: out, endedAt: d('2026-10-13T10:40:00Z'), toleranceMin: 10 })),
    ).toEqual([]);
  });
  it('no planned rest: not judged (an absence is not called a rest)', () => {
    expect(
      lateFromRest({ plannedMin: 0, startedAt: out, endedAt: d('2026-10-13T12:00:00Z'), toleranceMin: 10 }),
    ).toBeNull();
  });
  it('the planned length is the first rest not yet taken', () => {
    expect(
      plannedRestMinutes([
        { state: 'TAKEN', dueAt: '2026-10-13T08:00:00Z', durationMinutes: 15 },
        { state: 'PENDING', dueAt: '2026-10-13T10:00:00Z', durationMinutes: 30 },
      ]),
    ).toBe(30);
    expect(plannedRestMinutes(null)).toBe(0);
  });
});

describe('label rules — position', () => {
  const site = { lat: 47.9813, lng: 13.8269, geofenceRadius: 50 };
  it('on site', () => {
    expect(judgePosition({ lat: 47.9813, lng: 13.8269, accuracy: 10 }, site)).toEqual({
      fact: { judged: true, metresOutside: 0, accuracyM: 10 },
      outside: false,
    });
  });
  it('outside by distance', () => {
    const r = judgePosition({ lat: 48.2082, lng: 16.3738, accuracy: 10 }, site);
    expect(r.outside).toBe(true);
    expect(r.fact.metresOutside).toBeGreaterThan(100_000);
  });
  it('a fix coarser than the clock-in limit is not judged — never assumed on site', () => {
    expect(judgePosition({ lat: 48.2082, lng: 16.3738, accuracy: 2000 }, site)).toEqual({
      fact: { judged: false, notJudgedBecause: 'TOO_COARSE', accuracyM: 2000 },
      outside: false,
    });
  });
  it('no fix, or a site with no pin: not judged', () => {
    expect(judgePosition(null, site).fact).toEqual({ judged: false, notJudgedBecause: 'NO_FIX' });
    expect(judgePosition({ lat: 1, lng: 1 }, { lat: null, lng: null, geofenceRadius: 0 }).fact.notJudgedBecause).toBe(
      'NO_SITE',
    );
  });
});

describe('label facts', () => {
  const facts = {
    shift: {
      id: 's',
      name: 'Night',
      expectedStartAt: '2026-10-13T20:00:00.000Z',
      expectedEndAt: '2026-10-14T04:00:00.000Z',
      toleranceMin: 10,
      endIsDailyLimit: false,
    },
    firstOfShift: true,
    clockIn: { judged: true, metresOutside: 0 },
  };
  it('closing keeps what the clock-in recorded', () => {
    const closed = withClosing(facts, {
      closedHow: 'LAST_SEEN',
      clockOut: { judged: false, notJudgedBecause: 'NO_FIX' },
    });
    expect(closed).toMatchObject({ firstOfShift: true, closedHow: 'LAST_SEEN', clockIn: facts.clockIn });
  });
  it('a moved planned end is recorded', () => {
    expect(withExpectedEnd(facts, d('2026-10-14T05:00:00Z')).shift?.expectedEndAt).toBe('2026-10-14T05:00:00.000Z');
  });
  it('malformed stored facts read as none', () => {
    expect(readLabelFacts(null)).toBeNull();
    expect(readLabelFacts({ foo: 1 })).toBeNull();
    expect(readLabelFacts(facts)).toEqual(facts);
  });
});

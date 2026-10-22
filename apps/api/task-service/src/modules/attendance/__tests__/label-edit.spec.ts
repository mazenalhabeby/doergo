import { editTimeFlags, officeCloseFacts } from '../entries/entry-edit-labels';

/** The office edit and the labels — the old path untouched, the new one judged by the entry's own facts. */
const shiftStart = new Date('2026-10-13T16:00:00Z'); // 18:00 Vienna
const facts = (over: Record<string, unknown> = {}) => ({
  shift: {
    id: 's',
    name: 'Night',
    expectedStartAt: shiftStart.toISOString(),
    expectedEndAt: '2026-10-14T04:00:00.000Z',
    toleranceMin: 10,
    endIsDailyLimit: false,
  },
  firstOfShift: true,
  clockIn: { judged: true, metresOutside: 0 },
  ...over,
});
const expectation = { expectedStart: shiftStart, toleranceMin: 10 };
const entry = (over: Record<string, unknown> = {}) => ({
  clockInAt: new Date('2026-10-13T16:54:25Z'),
  expectedClockOutAt: new Date('2026-10-14T04:00:00Z'),
  endIsDailyLimit: false,
  labelRules: 1,
  labelFacts: facts(),
  ...over,
});

describe('office edit — old entries (no labelRules) recompute exactly as before', () => {
  it('a real 54 min late kept after an edit that only drops the seconds', () => {
    const r = editTimeFlags({
      entry: entry({ labelRules: null, labelFacts: null }),
      flags: ['LATE_ARRIVAL'],
      expectation,
      newClockIn: new Date('2026-10-13T16:54:00Z'),
      newClockOut: new Date('2026-10-14T05:08:00Z'),
    });
    expect(r.flags).toEqual(['LATE_ARRIVAL', 'OVERTIME']);
    expect(r.labelFacts).toBeUndefined();
  });
  it('no stored expectation: nothing to be late against (as before)', () => {
    const r = editTimeFlags({
      entry: entry({ labelRules: null, labelFacts: null }),
      flags: ['LATE_ARRIVAL', 'OUTSIDE_GEOFENCE_OUT'],
      expectation: { expectedStart: null, toleranceMin: 10 },
      newClockIn: new Date('2026-10-13T16:54:00Z'),
      newClockOut: null,
    });
    expect(r.flags).toEqual(['OUTSIDE_GEOFENCE_OUT']);
  });
});

describe('office edit — new entries keep a label while its reason stands', () => {
  it('seconds dropped: still late, against the frozen shift and grace', () => {
    const r = editTimeFlags({
      entry: entry(),
      flags: ['LATE_ARRIVAL'],
      expectation: { expectedStart: shiftStart, toleranceMin: 30 }, // the shift's grace changed since — not used
      newClockIn: new Date('2026-10-13T16:54:00Z'),
      newClockOut: null,
    });
    expect(r.flags).toEqual(['LATE_ARRIVAL']);
    expect(r.toleranceMin).toBe(10);
  });
  it('corrected to 18:05: no longer late', () => {
    const r = editTimeFlags({
      entry: entry(),
      flags: ['LATE_ARRIVAL'],
      expectation,
      newClockIn: new Date('2026-10-13T16:05:00Z'),
      newClockOut: null,
    });
    expect(r.flags).toEqual([]);
  });
  it('a return from lunch is never made late by an edit; its rest is judged again', () => {
    const r = editTimeFlags({
      entry: entry({
        clockInAt: new Date('2026-10-13T21:40:00Z'),
        labelFacts: facts({ firstOfShift: false, rest: { plannedMin: 30, takenMin: 40, overMin: 0 } }),
      }),
      flags: [],
      expectation,
      newClockIn: new Date('2026-10-13T22:00:00Z'), // 20 min later: rest 60 → 20 over
      newClockOut: null,
    });
    expect(r.flags).toEqual(['LATE_FROM_REST']);
    expect(r.labelFacts?.rest).toEqual({ plannedMin: 30, takenMin: 60, overMin: 20 });
  });
  it('labels about something else survive (outside zone, offline)', () => {
    const r = editTimeFlags({
      entry: entry(),
      flags: ['LATE_ARRIVAL', 'OUTSIDE_GEOFENCE_IN', 'RECORDED_OFFLINE'],
      expectation,
      newClockIn: new Date('2026-10-13T16:00:00Z'),
      newClockOut: null,
    });
    expect(r.flags).toEqual(['OUTSIDE_GEOFENCE_IN', 'RECORDED_OFFLINE']);
  });
  it('an office close is recorded as OFFICE', () => {
    expect(officeCloseFacts(facts() as never)?.closedHow).toBe('OFFICE');
    expect(officeCloseFacts(null)).toBeUndefined();
  });
});

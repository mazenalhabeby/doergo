import { checkEntryLabels, expectedLabels, type LabelFacts } from '@hbcfield/shared';

const at = (hhmm: string) => new Date(`2026-10-17T${hhmm}:00.000Z`);
const facts = (over: Partial<LabelFacts> = {}): LabelFacts => ({
  shift: {
    id: 's1',
    name: 'Day',
    expectedStartAt: at('08:00').toISOString(),
    expectedEndAt: at('16:00').toISOString(),
    toleranceMin: 10,
    endIsDailyLimit: false,
  },
  firstOfShift: true,
  clockIn: { judged: true, metresOutside: 0 },
  clockOut: { judged: true, metresOutside: 0 },
  closedHow: 'CLOCKED_OUT',
  ...over,
});
const entry = (over: Partial<Parameters<typeof checkEntryLabels>[0]> = {}) => ({
  clockInAt: at('08:05'),
  clockOutAt: at('16:00'),
  flagReasons: [] as string[],
  approvalStatus: 'AUTO',
  decidedByPerson: false,
  labelFacts: facts(),
  ...over,
});

describe('the nightly label check (shared rules)', () => {
  it('agrees with a clean day', () => {
    expect(checkEntryLabels(entry())).toBeNull();
  });

  it('works late, early, overtime and the daily limit out again', () => {
    expect(expectedLabels(entry({ clockInAt: at('08:30') }))).toEqual(['LATE_ARRIVAL']);
    expect(expectedLabels(entry({ clockOutAt: at('15:00') }))).toEqual(['EARLY_DEPARTURE']);
    expect(expectedLabels(entry({ clockOutAt: at('17:00') }))).toEqual(['OVERTIME']);
    const limit = facts({ shift: { ...facts().shift!, endIsDailyLimit: true } });
    expect(expectedLabels(entry({ labelFacts: limit, clockOutAt: at('17:00') }))).toEqual(['PAST_DAILY_LIMIT']);
    expect(expectedLabels(entry({ labelFacts: limit, clockOutAt: at('15:00') }))).toEqual([]);
  });

  it('only the first entry of a shift can be late; a long rest is late from the rest', () => {
    const back = facts({ firstOfShift: false, rest: { plannedMin: 30, takenMin: 55, overMin: 15 } });
    expect(expectedLabels(entry({ labelFacts: back, clockInAt: at('12:55') }))).toEqual(['LATE_FROM_REST']);
  });

  it('reports a missing label and one the facts do not explain', () => {
    const f = checkEntryLabels(entry({ clockInAt: at('08:30'), flagReasons: ['OVERTIME'], approvalStatus: 'PENDING' }));
    expect(f?.missing).toEqual(['LATE_ARRIVAL']);
    expect(f?.unexpected).toEqual(['OVERTIME']);
  });

  it('a judged position decides; one not judged is never second-guessed', () => {
    const outside = facts({ clockIn: { judged: true, metresOutside: 40 } });
    expect(checkEntryLabels(entry({ labelFacts: outside, flagReasons: ['APPROVED_REMOTE'] }))).toBeNull();
    expect(checkEntryLabels(entry({ labelFacts: outside }))?.missing).toEqual(['OUTSIDE_GEOFENCE_IN']);
    const coarse = facts({ clockIn: { judged: false, notJudgedBecause: 'TOO_COARSE' } });
    expect(
      checkEntryLabels(entry({ labelFacts: coarse, flagReasons: ['OUTSIDE_GEOFENCE_IN'], approvalStatus: 'PENDING' })),
    ).toBeNull();
  });

  it('a day waiting for a person but let through on its own is a finding — unless a person decided', () => {
    const late = { clockInAt: at('08:30'), flagReasons: ['LATE_ARRIVAL'] };
    expect(checkEntryLabels(entry({ ...late, approvalStatus: 'AUTO' }))?.expected.approval).toBe('PENDING');
    expect(checkEntryLabels(entry({ ...late, approvalStatus: 'APPROVED', decidedByPerson: true }))).toBeNull();
  });

  it('labels about how it was recorded are not checked; no facts means nothing to check', () => {
    expect(checkEntryLabels(entry({ flagReasons: ['RECORDED_OFFLINE', 'AUTO_CLOCK_IN'] }))).toBeNull();
    expect(checkEntryLabels(entry({ labelFacts: null }))).toBeNull();
  });
});

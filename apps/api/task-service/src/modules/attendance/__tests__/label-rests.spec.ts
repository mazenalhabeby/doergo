import { missedRestColumnsAfterOfficeRest, restColumnsAtBreakEnd } from '../label-rests';

/** Rests and the labels — new entries only. */
const facts = {
  shift: {
    id: 's',
    name: null,
    expectedStartAt: '2026-10-13T06:00:00.000Z',
    expectedEndAt: '2026-10-13T14:30:00.000Z',
    toleranceMin: 10,
    endIsDailyLimit: false,
  },
  firstOfShift: true,
  clockIn: { judged: true, metresOutside: 0 },
};
const plan = [{ dueAt: '2026-10-13T10:00:00.000Z', durationMinutes: 30, required: true, state: 'TAKEN' }];

describe('a rest taken with the Break button', () => {
  it('48 min against a planned 30 + 10 grace → LATE_FROM_REST, real length in the facts', () => {
    const cols = restColumnsAtBreakEnd(
      { labelRules: 1, labelFacts: facts, flagReasons: [], breakPlan: plan },
      { startedAt: new Date('2026-10-13T10:00:00Z'), endedAt: new Date('2026-10-13T10:48:00Z') },
    );
    expect(cols.flagReasons).toEqual(['LATE_FROM_REST']);
    expect((cols.labelFacts as { rest: unknown }).rest).toEqual({ plannedMin: 30, takenMin: 48, overMin: 8 });
  });
  it('within planned + grace: facts only, no label', () => {
    const cols = restColumnsAtBreakEnd(
      { labelRules: 1, labelFacts: facts, flagReasons: [], breakPlan: plan },
      { startedAt: new Date('2026-10-13T10:00:00Z'), endedAt: new Date('2026-10-13T10:35:00Z') },
    );
    expect(cols.flagReasons).toBeUndefined();
  });
  it('no planned rest, or an old entry: nothing', () => {
    const rest = { startedAt: new Date('2026-10-13T10:00:00Z'), endedAt: new Date('2026-10-13T11:30:00Z') };
    expect(restColumnsAtBreakEnd({ labelRules: 1, labelFacts: facts, breakPlan: [] }, rest)).toEqual({});
    expect(restColumnsAtBreakEnd({ labelRules: null, labelFacts: null, breakPlan: plan }, rest)).toEqual({});
  });
});

describe('the office adds the missing rest', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    labelRules: 1,
    flagReasons: ['MISSED_BREAK'],
    breakPlan: plan,
    approvalStatus: 'PENDING',
    ...over,
  });
  it('enough rest recorded: “Missed rest” goes, and the status follows', () => {
    expect(missedRestColumnsAfterOfficeRest(entry(), [{ durationMinutes: 30 }])).toEqual({
      flagReasons: [],
      approvalStatus: 'AUTO',
    });
  });
  it('not enough yet: unchanged', () => {
    expect(missedRestColumnsAfterOfficeRest(entry(), [{ durationMinutes: 15 }])).toEqual({});
  });
  it('another reason still needs review: status stays pending', () => {
    expect(
      missedRestColumnsAfterOfficeRest(entry({ flagReasons: ['MISSED_BREAK', 'LATE_ARRIVAL'] }), [
        { durationMinutes: 30 },
      ]),
    ).toEqual({
      flagReasons: ['LATE_ARRIVAL'],
      approvalStatus: 'PENDING',
    });
  });
  it('a decision a person made is not changed here; an old entry is not touched', () => {
    expect(missedRestColumnsAfterOfficeRest(entry({ approvalStatus: 'APPROVED' }), [{ durationMinutes: 30 }])).toEqual({
      flagReasons: [],
    });
    expect(missedRestColumnsAfterOfficeRest(entry({ labelRules: null }), [{ durationMinutes: 30 }])).toEqual({});
  });
});

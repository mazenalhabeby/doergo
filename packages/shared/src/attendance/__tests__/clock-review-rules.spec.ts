import { requiredRestShort, flagsWithMissedRest } from '../break-plan/taps';
import { ringSwitchedOff } from '../away-policy';
import { refusalSettlesOutside } from '../outside-shift';
import type { BreakPlanItem } from '../break-plan/plan';

const lunch = (over: Partial<BreakPlanItem> = {}): BreakPlanItem =>
  ({
    ruleId: 'r1',
    name: 'Lunch',
    dueAt: '2026-10-25T11:00:00Z',
    expiresAt: null,
    durationMinutes: 30,
    isPaid: false,
    required: true,
    state: 'TAKEN',
    snoozeCount: 0,
    snoozeMin: 15,
    maxSnoozes: 3,
    ...over,
  }) as BreakPlanItem;
const close = new Date('2026-10-25T16:00:00Z');

describe('a required rest too short is missed (clock review B7)', () => {
  it('one minute of a required thirty → short, flagged on a new entry', () => {
    expect(requiredRestShort([lunch()], close, 1, 10)).toBe(true);
    expect(flagsWithMissedRest([], [lunch()], close, { minutes: 1, toleranceMin: 10 })).toEqual(['MISSED_BREAK']);
  });

  it('within the tolerance, or the whole rest → not short', () => {
    expect(requiredRestShort([lunch()], close, 25, 10)).toBe(false);
    expect(requiredRestShort([lunch()], close, 30, 0)).toBe(false);
  });

  it('an old entry (no taken figure) keeps the old rule: a started rest is taken', () => {
    expect(flagsWithMissedRest([], [lunch()], close)).toEqual([]);
  });

  it('a rest not yet due at the close, or not required, is not judged', () => {
    expect(requiredRestShort([lunch({ dueAt: '2026-10-25T17:00:00Z' })], close, 0, 0)).toBe(false);
    expect(requiredRestShort([lunch({ required: false })], close, 0, 0)).toBe(false);
  });
});

describe('a ring switched off (clock review B6)', () => {
  it('only NONE switches it off', () => {
    expect(ringSwitchedOff('NONE')).toBe(true);
    expect(ringSwitchedOff('STRICT')).toBe(false);
    expect(ringSwitchedOff('AWAY_ALLOWED')).toBe(false);
    expect(ringSwitchedOff(null)).toBe(false);
  });
});

describe('a refusal settles the time outside the shift (clock review B1)', () => {
  it('nothing worked before the start → settled', () => {
    expect(
      refusalSettlesOutside({ clockInAt: '2026-10-25T07:05:00Z', expectedClockInAt: '2026-10-25T07:00:00Z' }, 10),
    ).toBe(true);
  });
  it('an hour early → that part was never asked about, not settled', () => {
    expect(
      refusalSettlesOutside({ clockInAt: '2026-10-25T06:00:00Z', expectedClockInAt: '2026-10-25T07:00:00Z' }, 10),
    ).toBe(false);
  });
});

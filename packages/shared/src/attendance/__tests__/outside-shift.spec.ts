/**
 * Time outside the planned shift (docs/plans/time-counting-model.md, phase 3): found, and counted by moving the plan.
 */
import { outsideShift, planAfterCounting } from '../outside-shift';

const at = (hm: string) => `2026-10-23T${hm}:00.000Z`;
const mike = {
  clockInAt: at('07:00'),
  clockOutAt: at('17:30'),
  expectedClockInAt: at('08:00'),
  expectedClockOutAt: at('16:00'),
};

describe('outsideShift', () => {
  it('finds the hour before and the 1 h 30 m after', () => {
    expect(outsideShift(mike, 10)).toEqual({ before: 60, after: 90, total: 150 });
  });
  it('ignores what is within the tolerance, like late and overtime', () => {
    expect(outsideShift({ ...mike, clockInAt: at('07:55'), clockOutAt: at('16:08') }, 10)).toBeNull();
  });
  it('has nothing to decide with no shift, a running entry, or a daily limit', () => {
    expect(outsideShift({ ...mike, expectedClockInAt: null, expectedClockOutAt: null })).toBeNull();
    expect(outsideShift({ ...mike, clockOutAt: null })).toBeNull();
    expect(outsideShift({ ...mike, endIsDailyLimit: true })).toBeNull();
  });
});

describe('planAfterCounting', () => {
  const o = outsideShift(mike, 10)!;
  it('counts all of it: the plan becomes the clocked day', () => {
    const p = planAfterCounting(mike, o, 150);
    expect([p.expectedClockInAt.toISOString(), p.expectedClockOutAt.toISOString(), p.counted]).toEqual([
      at('07:00'),
      at('17:30'),
      150,
    ]);
  });
  it('counts part of it: after the end first, then before the start', () => {
    expect(planAfterCounting(mike, o, 60).expectedClockOutAt.toISOString()).toBe(at('17:00'));
    const p = planAfterCounting(mike, o, 120);
    expect([p.expectedClockInAt.toISOString(), p.expectedClockOutAt.toISOString()]).toEqual([at('07:30'), at('17:30')]);
  });
  it('never past what was worked, and 0 leaves the plan', () => {
    expect(planAfterCounting(mike, o, 999).counted).toBe(150);
    const p = planAfterCounting(mike, o, 0);
    expect([p.expectedClockInAt.toISOString(), p.expectedClockOutAt.toISOString(), p.counted]).toEqual([
      at('08:00'),
      at('16:00'),
      0,
    ]);
  });
});

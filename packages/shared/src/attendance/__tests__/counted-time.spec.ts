import {
  computeCountedTime,
  shortfallMinutes,
  expectedPaidMinutes,
} from '@hbcfield/shared';

/**
 * The rule that turns hours worked into hours paid.
 *
 * There is exactly one of these in the codebase and this is the suite that keeps
 * it honest, because everything downstream — the phone, the timesheet, the
 * exports, the payroll figure — reads its answer and none of them re-derive it.
 */
const at = (hhmm: string) => new Date(`2026-09-06T${hhmm}:00.000Z`);

const SHIFT = { expectedStartAt: at('06:00'), expectedEndAt: at('18:00') };

describe('counted time', () => {
  describe('the early bird', () => {
    it('records 05:55 and pays from 06:00', () => {
      const r = computeCountedTime({ clockInAt: at('05:55'), clockOutAt: at('18:05'), ...SHIFT });
      expect(r.countedStartAt).toEqual(at('06:00'));
      expect(r.countedEndAt).toEqual(at('18:00'));
      expect(r.paidMinutes).toBe(720);
      expect(r.clamped).toBe(true);
    });

    it('does not credit arriving late', () => {
      // The same `max` in the other direction — he was not there at 06:00.
      const r = computeCountedTime({ clockInAt: at('06:40'), clockOutAt: at('18:00'), ...SHIFT });
      expect(r.countedStartAt).toEqual(at('06:40'));
      expect(r.paidMinutes).toBe(680);
    });
  });

  describe('tolerance', () => {
    it('treats arriving inside it as arriving on time', () => {
      const r = computeCountedTime({ clockInAt: at('06:03'), clockOutAt: at('18:00'), ...SHIFT, toleranceMin: 10 });
      expect(r.countedStartAt).toEqual(at('06:00'));
      expect(r.paidMinutes).toBe(720);
    });

    it('applies in both directions, so it favours neither side', () => {
      // Early within tolerance is NOT paid early…
      const early = computeCountedTime({ clockInAt: at('05:57'), clockOutAt: at('18:00'), ...SHIFT, toleranceMin: 10 });
      expect(early.countedStartAt).toEqual(at('06:00'));
      // …and leaving a few minutes early is not docked.
      const short = computeCountedTime({ clockInAt: at('06:00'), clockOutAt: at('17:56'), ...SHIFT, toleranceMin: 10 });
      expect(short.countedEndAt).toEqual(at('18:00'));
    });

    it('stops snapping outside it', () => {
      const r = computeCountedTime({ clockInAt: at('06:22'), clockOutAt: at('18:00'), ...SHIFT, toleranceMin: 10 });
      expect(r.countedStartAt).toEqual(at('06:22'));
    });
  });

  describe('the end', () => {
    it('does not pay for lingering', () => {
      const r = computeCountedTime({ clockInAt: at('06:00'), clockOutAt: at('18:05'), ...SHIFT });
      expect(r.countedEndAt).toEqual(at('18:00'));
      expect(r.paidMinutes).toBe(720);
    });

    it('pays approved overtime with NO special case — approving moved the expected end', () => {
      const r = computeCountedTime({
        clockInAt: at('06:00'),
        clockOutAt: at('19:40'),
        expectedStartAt: at('06:00'),
        expectedEndAt: at('19:30'), // 90 minutes approved
      });
      expect(r.countedEndAt).toEqual(at('19:30'));
      expect(r.paidMinutes).toBe(810); // 12h + 1h30
    });

    it('counts leaving early as what was actually worked', () => {
      const r = computeCountedTime({ clockInAt: at('06:00'), clockOutAt: at('16:40'), ...SHIFT });
      expect(r.countedEndAt).toEqual(at('16:40'));
      expect(r.paidMinutes).toBe(640);
    });
  });

  describe('breaks', () => {
    it('subtracts unpaid break minutes and nothing else', () => {
      const r = computeCountedTime({ clockInAt: at('05:55'), clockOutAt: at('18:05'), ...SHIFT, unpaidBreakMinutes: 30 });
      expect(r.paidMinutes).toBe(690);
    });

    it('leaves a paid break alone — it is simply not passed in', () => {
      const r = computeCountedTime({ clockInAt: at('06:00'), clockOutAt: at('18:00'), ...SHIFT, unpaidBreakMinutes: 0 });
      expect(r.paidMinutes).toBe(720);
    });
  });

  describe('no shift resolved', () => {
    it('counts the real time, unclamped — task work has nothing to be early for', () => {
      const r = computeCountedTime({ clockInAt: at('09:13'), clockOutAt: at('14:47') });
      expect(r.countedStartAt).toEqual(at('09:13'));
      expect(r.countedEndAt).toEqual(at('14:47'));
      expect(r.paidMinutes).toBe(334);
      expect(r.clamped).toBe(false);
    });
  });

  describe('the arithmetic that must never go wrong', () => {
    it('never returns negative minutes', () => {
      // A member who clocked out before the shift started, plus a break longer
      // than the whole session. Payroll subtracting a negative number is only
      // ever found by the person it underpaid.
      const r = computeCountedTime({
        clockInAt: at('05:30'), clockOutAt: at('05:45'), ...SHIFT, unpaidBreakMinutes: 60,
      });
      expect(r.paidMinutes).toBe(0);
    });

    it('leaves an open shift with no paid figure at all', () => {
      const r = computeCountedTime({ clockInAt: at('05:55'), clockOutAt: null, ...SHIFT });
      expect(r.countedEndAt).toBeNull();
      expect(r.paidMinutes).toBeNull();
      expect(r.countedStartAt).toEqual(at('06:00')); // the start is knowable already
    });

    it('survives a night shift, because it only ever compares instants', () => {
      const r = computeCountedTime({
        clockInAt: new Date('2026-09-06T21:55:00Z'),
        clockOutAt: new Date('2026-09-07T06:04:00Z'),
        expectedStartAt: new Date('2026-09-06T22:00:00Z'),
        expectedEndAt: new Date('2026-09-07T06:00:00Z'),
      });
      expect(r.paidMinutes).toBe(480);
    });
  });

  describe('shortfall — what the member is asked about', () => {
    it('reports how far short the clock-out falls', () => {
      expect(shortfallMinutes({ clockOutAt: at('16:40'), expectedEndAt: at('18:00') })).toBe(80);
    });
    it('says nothing inside the tolerance', () => {
      expect(shortfallMinutes({ clockOutAt: at('17:56'), expectedEndAt: at('18:00'), toleranceMin: 10 })).toBe(0);
    });
    it('says nothing when there is no shift to fall short of', () => {
      expect(shortfallMinutes({ clockOutAt: at('16:40') })).toBe(0);
    });
    it('says nothing when they stayed past the end', () => {
      expect(shortfallMinutes({ clockOutAt: at('18:30'), expectedEndAt: at('18:00') })).toBe(0);
    });
  });

  describe('what a shift is worth before anyone works it', () => {
    it('is the window net of unpaid rests', () => {
      expect(expectedPaidMinutes({ ...SHIFT, unpaidBreakMinutes: 30 })).toBe(690);
    });
    it('is unknown without a shift', () => {
      expect(expectedPaidMinutes({})).toBeNull();
    });
  });
});

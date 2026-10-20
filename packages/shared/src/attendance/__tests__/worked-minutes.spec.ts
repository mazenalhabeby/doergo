import { workedMinutes } from '@hbcfield/shared';

/**
 * Hours worked, as distinct from hours on site.
 *
 * `totalMinutes` is gross — clock-in to clock-out, breaks included — and the
 * services store it that way with a comment saying breaks are "netted out
 * downstream". Nothing downstream did it. Every screen showed the gross figure
 * under a heading that reads as hours worked, and the reports metric labelled
 * "Hours worked" summed it directly.
 *
 * The visible effect: a shift of 13h05m with a one-hour break displayed as
 * "13.1h" beside "1h", which reads as fourteen hours on site and pays an hour
 * that was not worked.
 *
 * Gross remains the right thing to STORE — it is the measured fact, and breaks
 * are added and corrected afterwards, so a pre-subtracted total would drift.
 * Netting belongs at the point of reading.
 */
describe('workedMinutes', () => {
  it('subtracts the break from the clock time', () => {
    // The reported shift: 18:36 to 07:41 is 785 minutes, one hour of break.
    expect(workedMinutes({ totalMinutes: 785, breakMinutes: 60 })).toBe(725);
    expect(+(725 / 60).toFixed(1)).toBe(12.1);
  });

  it('returns the clock time when there is no break', () => {
    expect(workedMinutes({ totalMinutes: 480, breakMinutes: 0 })).toBe(480);
    expect(workedMinutes({ totalMinutes: 480 })).toBe(480);
  });

  it('never goes negative', () => {
    /*
      A break longer than its shift is a data error. It must not produce negative
      hours, because in a SUM those net silently against other people's rows — a
      wrong total that looks plausible is worse than one row that looks absurd.
    */
    expect(workedMinutes({ totalMinutes: 30, breakMinutes: 60 })).toBe(0);
  });

  it('treats a shift still open as zero rather than crashing', () => {
    // totalMinutes is null until clock-out.
    expect(workedMinutes({ totalMinutes: null, breakMinutes: 15 })).toBe(0);
    expect(workedMinutes(null)).toBe(0);
    expect(workedMinutes(undefined)).toBe(0);
  });

  it('is what the payroll sum should add up', () => {
    // Three shifts, one with a long break: the totals must differ by the breaks.
    const week = [
      { totalMinutes: 480, breakMinutes: 30 },
      { totalMinutes: 785, breakMinutes: 60 },
      { totalMinutes: 240, breakMinutes: 0 },
    ];
    const gross = week.reduce((s, e) => s + e.totalMinutes, 0);
    const net = week.reduce((s, e) => s + workedMinutes(e), 0);
    expect(gross).toBe(1505);
    expect(net).toBe(1415);
    expect(gross - net).toBe(90); // exactly the breaks
  });
});

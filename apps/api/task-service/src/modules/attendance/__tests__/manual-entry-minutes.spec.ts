import { workedMinutes } from '@hbcfield/shared';

/**
 * What `totalMinutes` means, and why it must mean the same thing everywhere.
 *
 * It is GROSS: the wall time between clocking in and out. The break is stored
 * beside it and subtracted once, at the point of display, by `workedMinutes()`.
 *
 * The manual back-fill used to subtract the break before storing, so the same
 * column meant net for a hand-added row and gross for a clocked one. Nothing
 * caught it, because each half was individually reasonable — and the result was
 * an hour missing from every back-filled shift, which is somebody's pay.
 */
describe('a manually added entry means the same as a clocked one', () => {
  /** What the back-fill stores for a shift, given the break is kept separate. */
  const store = (startUtcHour: number, endUtcHour: number, breakMin: number) => {
    const clockIn = new Date(Date.UTC(2026, 8, 1, startUtcHour));
    let clockOut = new Date(Date.UTC(2026, 8, 1, endUtcHour));
    // Overnight: an end at or before the start is the next day.
    if (clockOut <= clockIn) clockOut = new Date(clockOut.getTime() + 24 * 3600_000);
    return {
      totalMinutes: Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / 60000)),
      breakMinutes: breakMin,
    };
  };

  it('reports 11 hours for an overnight shift with an hour of break', () => {
    // The real case: 18:00 → 06:00 with a one-hour break. Twelve hours on the
    // clock, eleven worked. It read as ten.
    const entry = store(22, 10, 60);
    expect(entry.totalMinutes).toBe(720);
    expect(workedMinutes(entry)).toBe(660);
  });

  it('does not subtract the break twice', () => {
    const entry = store(22, 10, 60);
    // The stored value is the wall time — the break has not been taken off yet.
    expect(entry.totalMinutes).toBe(12 * 60);
    // And it comes off exactly once.
    expect(workedMinutes(entry)).toBe(11 * 60);
  });

  it('keeps the break visible instead of folding it away', () => {
    // Folded into the total, there is nothing left to show as a break — which
    // is why the break row was missing from the screen as well.
    const entry = store(22, 10, 60);
    expect(entry.breakMinutes).toBe(60);
  });

  it('handles a day shift the same way', () => {
    const entry = store(8, 17, 30);
    expect(entry.totalMinutes).toBe(540);
    expect(workedMinutes(entry)).toBe(510);
  });

  it('stores the full span when there is no break at all', () => {
    const entry = store(8, 16, 0);
    expect(entry.totalMinutes).toBe(480);
    expect(workedMinutes(entry)).toBe(480);
  });

  it('never reports negative work when the break exceeds the shift', () => {
    // A typo — a 30-minute shift with a 60-minute break — must read as zero,
    // not as minus half an hour on somebody's timesheet.
    const entry = store(8, 8.5 as unknown as number, 60);
    expect(workedMinutes({ totalMinutes: 30, breakMinutes: 60 })).toBe(0);
    expect(entry.breakMinutes).toBe(60);
  });
});

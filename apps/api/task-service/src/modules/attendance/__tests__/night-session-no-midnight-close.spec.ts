/**
 * A night is never cut at midnight (asked 2026-10-29).
 *
 * Clock-in 18:00 Vienna. With a shift to 06:00, or with free hours (no planned
 * end), nothing closes the session at midnight: every automatic close counts
 * from the clock-in or the planned end, never from a calendar day.
 */
import { presenceCloseDue } from '@hbcfield/shared';
import { isAbandoned } from '../core/open-shift-close';

const clockInAt = new Date('2026-10-29T17:00:00Z'); // 18:00 Vienna (CET)
const shiftEnd = new Date('2026-10-30T05:00:00Z'); // 06:00 Vienna next morning
const at = (iso: string) => new Date(iso);
const everyQuarterOfTheNight = Array.from({ length: 49 }, (_, i) => new Date(clockInAt.getTime() + i * 15 * 60_000));

describe('a night shift 18:00 → 06:00', () => {
  it('is never closed as forgotten during the night — midnight included', () => {
    for (const now of everyQuarterOfTheNight) expect(isAbandoned({ clockInAt, expectedClockOutAt: shiftEnd }, now)).toBe(false);
    expect(isAbandoned({ clockInAt, expectedClockOutAt: shiftEnd }, at('2026-10-29T23:00:00Z'))).toBe(false); // 00:00
  });
  it('a forgotten clock-out is only closed (temporarily) 12 h after the planned 06:00', () => {
    expect(isAbandoned({ clockInAt, expectedClockOutAt: shiftEnd }, at('2026-10-30T16:59:00Z'))).toBe(false);
    expect(isAbandoned({ clockInAt, expectedClockOutAt: shiftEnd }, at('2026-10-30T17:00:00Z'))).toBe(true);
  });
});

describe('free hours (no shift) from 18:00', () => {
  it('is never closed as forgotten during the night — midnight included', () => {
    for (const now of everyQuarterOfTheNight) expect(isAbandoned({ clockInAt, expectedClockOutAt: null }, now)).toBe(false);
  });
  it('a session nobody ever ended is only closed (temporarily) 24 h after the clock-in', () => {
    expect(isAbandoned({ clockInAt, expectedClockOutAt: null }, at('2026-10-30T16:59:00Z'))).toBe(false);
    expect(isAbandoned({ clockInAt, expectedClockOutAt: null }, at('2026-10-30T17:00:00Z'))).toBe(true);
  });
  it('the automatic clock (arriving/leaving) never closes somebody still on site, midnight or not', () => {
    const settings = { noShiftMinutes: 480, closeAfterMinutes: 60 };
    for (const now of everyQuarterOfTheNight) {
      const lastSeenAt = new Date(now.getTime() - 5 * 60_000); // the phone still hears them on site
      expect(presenceCloseDue({ clockInAt, settings, now, leftSiteAt: null, lastSeenAt, presence: 'ON_SITE' }).due).toBe(
        false,
      );
    }
  });
  it('even when the phone is silent, it waits for the hours + grace — not midnight', () => {
    const settings = { noShiftMinutes: 480, closeAfterMinutes: 60 };
    const silent = { leftSiteAt: null, lastSeenAt: null, presence: null };
    expect(presenceCloseDue({ clockInAt, settings, now: at('2026-10-29T23:00:00Z'), ...silent }).due).toBe(false); // 00:00
    expect(presenceCloseDue({ clockInAt, settings, now: at('2026-10-30T01:59:00Z'), ...silent }).due).toBe(false); // 02:59
  });
});

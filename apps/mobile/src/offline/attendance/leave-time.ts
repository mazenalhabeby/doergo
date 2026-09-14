import { addDaysStr, localPartsIn, zonedWallTimeToUtc } from '@hbcfield/shared/client';

/**
 * "When did you leave?" — an hour and minute, turned into the instant it means.
 *
 * Read on the day of the clock-in, in the shift's own time zone; a time at or
 * before the clock-in means the next day (a night shift ending at 02:00). Null
 * when that instant is still in the future — nobody left later than now.
 */
export function leaveTimeFrom(hhmm: string, clockInAt: Date, tz: string, now: Date): Date | null {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const day = localPartsIn(clockInAt, tz).dateStr;
  let at = zonedWallTimeToUtc(day, h!, m!, tz);
  if (at.getTime() <= clockInAt.getTime()) at = zonedWallTimeToUtc(addDaysStr(day, 1), h!, m!, tz);
  return at.getTime() > now.getTime() ? null : at;
}

/** "18:35" in the shift's zone — to seed the picker. */
export function hhmmIn(at: Date, tz: string): string {
  const mins = localPartsIn(at, tz).minutesOfDay;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** Minutes a clock-out now would run past the planned end; 0 within the grace. */
export function minutesPastEnd(expectedEnd: Date | string | null | undefined, now: Date, graceMin = 5): number {
  if (!expectedEnd) return 0;
  const past = Math.floor((now.getTime() - new Date(expectedEnd).getTime()) / 60_000);
  return past > graceMin ? past : 0;
}

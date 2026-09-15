import { LOG_MEMBER_BACKDATE_DAYS } from '@hbcfield/shared/client';

/**
 * Calendar days for the logbook form, on the phone.
 *
 * A picked day is a LOCAL calendar day — "YYYY-MM-DD" as the member reads it
 * off their own wall calendar. `toISOString().slice(0, 10)` is the tempting
 * shortcut and it is wrong for an evening in Vienna: at 00:30 on the 15th it
 * answers the 14th, so the calendar would open on yesterday and "Today" would
 * select a day that is not today.
 *
 * Pure (no React Native), so the bounds the calendar greys out are pinned by a
 * spec against the same shared constant the server refuses by.
 */

const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** A local day as "YYYY-MM-DD". */
export function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of a "YYYY-MM-DD", or null for anything that is not a real day ("2026-02-30"). */
export function dateFromDayKey(key: string | null | undefined): Date | null {
  const m = KEY.exec((key ?? '').trim());
  if (!m) return null;
  const d = new Date(+m[1]!, +m[2]! - 1, +m[3]!);
  return d.getMonth() === +m[2]! - 1 && d.getDate() === +m[3]! ? d : null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** `days` calendar days before a local day — by the calendar, so a DST change cannot shift it by an hour into the next day. */
const daysBefore = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - days);

/**
 * The days an ENTRY may be dated with, as the calendar offers them.
 *
 * Never after today: the server allows a day's grace for clocks and time zones,
 * but a member choosing tomorrow on purpose is filing a plan, not an entry.
 *
 * A member reaches back `LOG_MEMBER_BACKDATE_DAYS - 1` days, not the full
 * window. A past day is sent as its local midday (`occurredAtForDay`), and the
 * oldest full-window day's midday is already outside the window by the
 * afternoon — offering it would be offering a day the server then refuses.
 * Somebody who manages assets types in history, so they have no lower bound.
 */
export function logEntryDayBounds(
  now: Date,
  opts: { canManageAssets?: boolean } = {},
): { minDate?: Date; maxDate: Date } {
  const today = startOfDay(now);
  return opts.canManageAssets
    ? { maxDate: today }
    : { minDate: daysBefore(today, LOG_MEMBER_BACKDATE_DAYS - 1), maxDate: today };
}

/**
 * The instant an entry chosen for `dayKey` is filed at.
 *
 * Today is NOW — two entries logged this morning keep their order, and "latest
 * reading" is decided by date. A past day is its local midday: a whole day
 * from both of its edges, so no time zone between here and the server can move
 * it onto a neighbouring date.
 */
export function occurredAtForDay(dayKey: string, now: Date): Date | null {
  const day = dateFromDayKey(dayKey);
  if (!day) return null;
  if (dayKeyOf(day) === dayKeyOf(now)) return new Date(now.getTime());
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0, 0);
}

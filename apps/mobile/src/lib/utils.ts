/**
 * Utility functions for the mobile app
 * Date formatting, time helpers, and common utilities
 */
import { localDateKey } from '@hbcfield/shared/client';

// =============================================================================
// DATE FORMATTING
// =============================================================================

/**
 * Format a date as a time range (e.g., "9:00 AM - 10:00 AM")
 * Used for displaying task time slots
 */
export function formatTimeRange(dueDate: string | Date, durationHours: number = 1, hour12: boolean = false): string {
  const date = new Date(dueDate);
  const hours = date.getHours();
  const minutes = date.getMinutes();

  const startTime = formatClock(hours, minutes, hour12);
  const endHours = hours + durationHours;
  const endTime = formatClock(endHours, minutes, hour12);

  // A slot that runs past midnight wraps to the next day (23:00 + 2h -> 01:00);
  // mark it so "23:00 - 01:00" doesn't read as a 22-hour backwards range.
  const nextDay = endHours >= 24 ? ' (+1)' : '';

  return `${startTime} - ${endTime}${nextDay}`;
}

/** A moment's time of day, honoring the member's 12h/24h preference. */
export function formatTimeOfDay(at: Date | number, hour12: boolean = false): string {
  const d = typeof at === 'number' ? new Date(at) : at;
  return formatClock(d.getHours(), d.getMinutes(), hour12);
}

/** Format hour+minute honoring the 12h/24h preference. */
function formatClock(h: number, m: number, hour12: boolean): string {
  const hh = ((h % 24) + 24) % 24;
  const displayMinute = m.toString().padStart(2, '0');
  if (!hour12) {
    return `${hh.toString().padStart(2, '0')}:${displayMinute}`;
  }
  const period = hh >= 12 ? 'PM' : 'AM';
  const displayHour = hh % 12 || 12;
  return `${displayHour}:${displayMinute} ${period}`;
}

/**
 * Human city/region label from an IANA timezone.
 * "America/New_York" -> "New York", "Europe/Vienna" -> "Vienna".
 */
export function cityFromTz(tz?: string | null): string {
  if (!tz) return '';
  const last = tz.split('/').pop() || tz;
  return last.replace(/_/g, ' ');
}

/**
 * Format a time (e.g., "9:00 AM" or "09:00"), honoring the 12h/24h preference.
 *
 * When `timeZone` (IANA, e.g. "America/New_York") is given, the wall-clock is
 * computed IN THAT ZONE via Intl and the SHORT zone label is appended by the
 * formatter (e.g. "6:00 AM EST" / "08:00 CET", falling back to a GMT offset like
 * "GMT+5:30" for zones without a common abbreviation). DST-aware. On an invalid
 * zone it falls back to the device local zone with no label. Without a
 * `timeZone` it renders in the device zone.
 */
// Cache one Intl.DateTimeFormat per (hour12, timeZone) combo — these are called
// once per row in attendance lists, and constructing the formatter each time is
// the expensive part (especially on lower-end phones).
const _dtfCache = new Map<string, Intl.DateTimeFormat>();
function getTimeDtf(hour12: boolean, timeZone: string): Intl.DateTimeFormat {
  const key = `${hour12 ? 1 : 0}|${timeZone}`;
  let fmt = _dtfCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(hour12 ? 'en-US' : 'en-GB', {
      hour: hour12 ? 'numeric' : '2-digit',
      minute: '2-digit',
      hour12,
      timeZone,
      timeZoneName: 'short',
    });
    _dtfCache.set(key, fmt);
  }
  return fmt;
}

export function formatTime(
  date: string | Date,
  hour12: boolean = false,
  timeZone?: string | null,
): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  if (!timeZone) return formatClock(d.getHours(), d.getMinutes(), hour12);
  try {
    // The short zone label (e.g. "EST") is included by the formatter itself.
    return getTimeDtf(hour12, timeZone).format(d);
  } catch {
    // Invalid timezone → fall back to the local zone with no label.
    return formatClock(d.getHours(), d.getMinutes(), hour12);
  }
}

// Date formatters are cached per (locale, timeZone) for the same reason as the
// time ones: attendance/task lists call them once per row.
const _dateDtfCache = new Map<string, Intl.DateTimeFormat>();
function getDateDtf(locale: string, timeZone?: string | null, withYear = false): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone || ''}|${withYear ? 'y' : ''}`;
  let fmt = _dateDtfCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' as const } : {}),
      ...(timeZone ? { timeZone } : {}),
    });
    _dateDtfCache.set(key, fmt);
  }
  return fmt;
}

/**
 * Format a date (e.g. "15. Jan." / "Jan 15"), locale- AND timezone-aware.
 *
 * Pass the entry's zone so a date label agrees with the zoned time rendered
 * next to it (otherwise a night shift can show the neighbouring day).
 */
export function formatDateOf(
  input: string | number | Date,
  locale: string = 'en-US',
  timeZone?: string | null,
  withYear = false,
): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return getDateDtf(locale, timeZone, withYear).format(d);
  } catch {
    return getDateDtf(locale, undefined, withYear).format(d);
  }
}

/**
 * Due-date label: "Today" / "Tomorrow" (caller-supplied, translated) else a
 * locale date. A due date is a calendar date the worker reads on-site, so the
 * day is resolved in the device zone — only the wording is localized here.
 */
export function formatDueDateOf(
  input: string | number | Date,
  locale: string = 'en-US',
  labels: { today: string; tomorrow: string },
): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  if (target.getTime() === today.getTime()) return labels.today;
  if (target.getTime() === tomorrow.getTime()) return labels.tomorrow;
  return formatDateOf(d, locale);
}

/**
 * "Today" / "Yesterday" (caller-supplied, translated) else a locale date.
 * The day comparison happens IN `timeZone`, so the label matches the entry's
 * own calendar day rather than the device's.
 */
export function formatDateRelativeOf(
  input: string | number | Date,
  locale: string = 'en-US',
  timeZone: string | null | undefined,
  labels: { today: string; yesterday: string },
): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const key = localDateKey(d, timeZone);
  if (key === localDateKey(now, timeZone)) return labels.today;
  if (key === localDateKey(yesterday, timeZone)) return labels.yesterday;
  return formatDateOf(d, locale, timeZone);
}

/**
 * Format a raw "HH:MM" schedule string honoring the 12h/24h preference.
 * "17:30" -> "5:30 PM" (12h) or "17:30" (24h).
 */
export function formatClockString(hhmm: string | null | undefined, hour12: boolean = false): string {
  if (!hhmm) return '';
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  return formatClock(h, m, hour12);
}

/**
 * Format a date as short date string (e.g., "Jan 15")
 */
export function formatShortDate(date: string | Date, locale: string = 'en-US'): string {
  return new Date(date).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
  });
}

// =============================================================================
// WEEK/CALENDAR HELPERS
// =============================================================================

/** Same calendar day — the shared rule (packages/shared/src/utils/date.ts). */
export { isSameDay } from '@hbcfield/shared/client';

// =============================================================================
// TASK HELPERS
// =============================================================================

/**
 * Generate a display-friendly job ID from a task
 * e.g., task.id "abc123def456" -> "A-456"
 */
export function getJobId(taskId: string): string {
  return `A-${taskId.slice(-3).toUpperCase()}`;
}

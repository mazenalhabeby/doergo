/**
 * Utility functions for the mobile app
 * Date formatting, time helpers, and common utilities
 */

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
 * Calendar day (YYYY-MM-DD) of an instant AS SEEN IN `timeZone`.
 *
 * Comparing these strings is how "is this today?" stays correct across zones —
 * a device in Vienna must not decide the day for an entry stamped in New York.
 * `en-CA` is used purely because it yields ISO-ordered output.
 */
function dayKeyInZone(d: Date, timeZone?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
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
  const key = dayKeyInZone(d, timeZone);
  if (key === dayKeyInZone(now, timeZone)) return labels.today;
  if (key === dayKeyInZone(yesterday, timeZone)) return labels.yesterday;
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

export type WeekDay = {
  date: Date;
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  isWeekend: boolean;
};

/**
 * Get the days of the week (Mon–Sun) that contains the given reference date.
 * Defaults to the current week when no argument is provided.
 */
export function getWeekDays(referenceDate?: Date): WeekDay[] {
  const today = new Date();
  const ref = referenceDate ?? today;
  const currentDay = ref.getDay();
  // Adjust to start from Monday (0 = Monday, 6 = Sunday)
  const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;

  const monday = new Date(ref);
  monday.setDate(ref.getDate() + mondayOffset);

  const days: WeekDay[] = [];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);

    const isToday = date.toDateString() === today.toDateString();
    const isWeekend = i >= 5; // Saturday and Sunday

    days.push({
      date,
      dayName: dayNames[i],
      dayNumber: date.getDate(),
      isToday,
      isWeekend,
    });
  }

  return days;
}

/**
 * Check if a date is a weekend
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

// =============================================================================
// DISTANCE CALCULATION
// =============================================================================

/**
 * Calculate distance between two GPS points using Haversine formula
 * Returns distance in meters
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// =============================================================================
// DURATION & DATE FORMATTING (for attendance screens)
// =============================================================================

/**
 * Format duration from minutes to human-readable (e.g., "2h 30m")
 */
export function formatDurationMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}


// =============================================================================
// RELATIVE TIME AGO
// =============================================================================

/**
 * Format a date as time ago (e.g., "Just now", "5m ago", "2h ago", "3d ago")
 * Used for comment timestamps, activity feeds, etc.
 */
export function formatTimeAgo(date: string | Date, locale: string = 'en-US'): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'Just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'Just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  // Older than a week — show short date
  return formatShortDate(date, locale);
}

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

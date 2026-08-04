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

  return `${startTime} - ${endTime}`;
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
 * computed IN THAT ZONE via Intl and a " · <city>" label is appended
 * (e.g. "6:00 AM · New York"). On an invalid zone it falls back to the device
 * local zone with no label. Without a `timeZone` it renders in the device zone.
 */
export function formatTime(
  date: string | Date,
  hour12: boolean = false,
  timeZone?: string | null,
): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  if (!timeZone) return formatClock(d.getHours(), d.getMinutes(), hour12);
  try {
    const time = d.toLocaleTimeString(hour12 ? 'en-US' : 'en-GB', {
      hour: hour12 ? 'numeric' : '2-digit',
      minute: '2-digit',
      hour12,
      timeZone,
    });
    const city = cityFromTz(timeZone);
    return city ? `${time} · ${city}` : time;
  } catch {
    // Invalid timezone → fall back to the local zone with no label.
    return formatClock(d.getHours(), d.getMinutes(), hour12);
  }
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
 * Format a date as relative time (e.g., "Today", "Tomorrow", "Jan 15")
 */
export function formatRelativeDate(date: string | Date): string {
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const targetDate = new Date(d);
  targetDate.setHours(0, 0, 0, 0);

  if (targetDate.getTime() === today.getTime()) {
    return 'Today';
  }
  if (targetDate.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  }

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format a date as short date string (e.g., "Jan 15")
 */
export function formatShortDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
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

/**
 * Format a date as time (e.g., "02:30 PM")
 */
export function formatTimeString(dateString: string | Date, hour12: boolean = false): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString(hour12 ? 'en-US' : 'en-GB', {
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12,
  });
}

/**
 * Format a date with relative labels (Today, Yesterday, or short date)
 */
export function formatDateRelative(dateString: string | Date): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// =============================================================================
// RELATIVE TIME AGO
// =============================================================================

/**
 * Format a date as time ago (e.g., "Just now", "5m ago", "2h ago", "3d ago")
 * Used for comment timestamps, activity feeds, etc.
 */
export function formatTimeAgo(date: string | Date): string {
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
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
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

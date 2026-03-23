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
export function formatTimeRange(dueDate: string | Date, durationHours: number = 1): string {
  const date = new Date(dueDate);
  const hours = date.getHours();
  const minutes = date.getMinutes();

  const formatTime = (h: number, m: number): string => {
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    const displayMinute = m.toString().padStart(2, '0');
    return `${displayHour}:${displayMinute} ${period}`;
  };

  const startTime = formatTime(hours, minutes);
  const endHours = hours + durationHours;
  const endTime = formatTime(endHours, minutes);

  return `${startTime} - ${endTime}`;
}

/**
 * Format a time (e.g., "9:00 AM")
 */
export function formatTime(date: string | Date): string {
  const d = new Date(date);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  const displayMinute = minutes.toString().padStart(2, '0');
  return `${displayHour}:${displayMinute} ${period}`;
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
 * Get the days of the current week starting from Monday
 */
export function getWeekDays(): WeekDay[] {
  const today = new Date();
  const currentDay = today.getDay();
  // Adjust to start from Monday (0 = Monday, 6 = Sunday)
  const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;

  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

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
export function formatTimeString(dateString: string | Date): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
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
// TASK HELPERS
// =============================================================================

/**
 * Generate a display-friendly job ID from a task
 * e.g., task.id "abc123def456" -> "A-456"
 */
export function getJobId(taskId: string): string {
  return `A-${taskId.slice(-3).toUpperCase()}`;
}

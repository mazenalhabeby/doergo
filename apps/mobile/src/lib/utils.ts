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
 * Format a date as full date string (e.g., "January 15, 2024")
 */
export function formatFullDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
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

/**
 * Format a date range for time off requests (e.g., "Jan 15 - Jan 20, 2024")
 */
export function formatDateRange(startDate: string | Date, endDate: string | Date): string {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return `${startStr} - ${endStr}`;
}

/**
 * Get the days remaining until a date
 */
export function getDaysUntil(date: string | Date): number {
  const target = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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
// STRING HELPERS
// =============================================================================

/**
 * Truncate a string to a maximum length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Capitalize the first letter of a string
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Get initials from a name (e.g., "John Doe" -> "JD")
 */
export function getInitials(firstName?: string, lastName?: string): string {
  const first = firstName?.charAt(0)?.toUpperCase() || '';
  const last = lastName?.charAt(0)?.toUpperCase() || '';
  return `${first}${last}`;
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

/**
 * Progress stages for task status
 */
export const TASK_PROGRESS_STAGES = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'] as const;

/**
 * Get the progress index for a task status (0-3)
 */
export function getTaskProgressIndex(status: string): number {
  const upperStatus = status.toUpperCase();

  switch (upperStatus) {
    case 'DRAFT':
    case 'NEW':
      return 0;
    case 'ASSIGNED':
      return 1;
    case 'IN_PROGRESS':
    case 'BLOCKED':
      return 2;
    case 'COMPLETED':
    case 'CLOSED':
      return 3;
    case 'CANCELED':
      return -1; // Special case for canceled
    default:
      return 0;
  }
}

/**
 * Check if a task can be started (must be ASSIGNED)
 */
export function canStartTask(status: string): boolean {
  return status.toUpperCase() === 'ASSIGNED';
}

/**
 * Check if a task can be completed (must be IN_PROGRESS)
 */
export function canCompleteTask(status: string): boolean {
  return status.toUpperCase() === 'IN_PROGRESS';
}

/**
 * Check if a task can be blocked (must be IN_PROGRESS)
 */
export function canBlockTask(status: string): boolean {
  return status.toUpperCase() === 'IN_PROGRESS';
}

// =============================================================================
// NUMBER HELPERS
// =============================================================================

/**
 * Format a number with commas (e.g., 1000 -> "1,000")
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Clamp a number between min and max
 */
export function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(num, min), max);
}

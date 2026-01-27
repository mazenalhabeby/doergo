/**
 * Shared Date Utilities
 * Centralized date manipulation functions to avoid duplication.
 */

/**
 * Get the start of day (00:00:00.000) for a given date
 */
export function getStartOfDay(date: Date | string): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of day (23:59:59.999) for a given date
 */
export function getEndOfDay(date: Date | string): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Build a Prisma-compatible date range filter object
 * Returns null if both dates are undefined
 */
export function buildDateRangeFilter(
  startDate?: Date | string,
  endDate?: Date | string,
): { gte?: Date; lte?: Date } | null {
  if (!startDate && !endDate) return null;

  const filter: { gte?: Date; lte?: Date } = {};

  if (startDate) {
    filter.gte = getStartOfDay(startDate);
  }
  if (endDate) {
    filter.lte = getEndOfDay(endDate);
  }

  return filter;
}

/**
 * Build a date filter for a single day
 */
export function buildSingleDayFilter(date: Date | string): { gte: Date; lte: Date } {
  return {
    gte: getStartOfDay(date),
    lte: getEndOfDay(date),
  };
}

/**
 * Format duration from minutes to human-readable string
 * @example formatDuration(90) => "1h 30m"
 * @example formatDuration(45) => "45m"
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '-';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Format a date string to time only (e.g., "2:30 PM")
 */
export function formatTime(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a date string to short date (e.g., "Jan 27")
 */
export function formatShortDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a date string to full date (e.g., "January 27, 2026")
 */
export function formatFullDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Get relative day label (Today, Yesterday, or formatted date)
 */
export function getRelativeDayLabel(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return formatShortDate(dateString);
}

/**
 * Calculate minutes between two dates
 */
export function calculateMinutesBetween(start: Date | string, end: Date | string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.floor((endDate.getTime() - startDate.getTime()) / 60000);
}

/**
 * Get ISO date string (YYYY-MM-DD) for a date
 */
export function toISODateString(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

/**
 * Get the start of the current week (Monday)
 */
export function getStartOfWeek(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of the current week (Sunday)
 */
export function getEndOfWeek(date: Date = new Date()): Date {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Get the start of the current month
 */
export function getStartOfMonth(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of the current month
 */
export function getEndOfMonth(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0); // Last day of previous month
  d.setHours(23, 59, 59, 999);
  return d;
}

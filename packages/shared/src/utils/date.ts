import { pad2, partsDateKey, zonedParts } from './zone-parts';
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
  if (minutes === null || minutes === undefined || !Number.isFinite(Number(minutes))) return '-';
  // Whole minutes: a fractional input printed "1h 30.5m".
  const whole = Math.round(Number(minutes));
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * A duration in SECONDS — 3665 → "1h 1m 5s", 125 → "2m 5s", 45 → "45s".
 *
 * Named for its unit: `formatDuration` takes MINUTES, and two functions called
 * the same thing with different units print a 60× wrong figure with no type
 * error. Seconds are shown — this is for things measured in seconds (a timer,
 * a recording); work time is minutes, through `formatDuration`.
 */
export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return '-';
  if (seconds < 0) return '0s';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  return parts.join(' ');
}

/**
 * Hours as people read them: 0.5 → "30m", 1.5 → "1h 30m", 11 → "11h".
 *
 * Reports carry hours as decimals (they are summed and charted), and "0.5h"
 * reads as a typo on a timesheet. Rounded to the minute here, at display, so
 * the totals underneath stay exact. Negative values keep their sign.
 */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(Number(hours))) return '-';
  const totalMinutes = Math.round(Math.abs(Number(hours)) * 60);
  const text = formatDuration(totalMinutes);
  return Number(hours) < 0 && totalMinutes > 0 ? `-${text}` : text;
}

/**
 * Format a date to time only (e.g., "2:30 PM")
 */
export function formatTime(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return '-';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a date to short date (e.g., "Jan 27")
 */
export function formatShortDate(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return '-';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * The UTC calendar day of a Date, as "YYYY-MM-DD".
 *
 * Right for a Postgres `DATE` (Prisma reads it back as UTC midnight, so the UTC
 * day IS the stored day) and for a day you deliberately mean in UTC. ⚠️ WRONG
 * for a timestamp you mean as a local day — at 00:30 in Vienna it answers
 * yesterday; use `localDateKey(instant, zone)` for that. The one place this
 * one-liner is written; everything else calls it.
 */
export function toISODateString(date: Date): string {
  return date.toISOString().slice(0, 10);
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

/**
 * A calendar date, in the reader's own format, without moving it.
 *
 * ⚠️ `new Date('2030-12-31').toLocaleDateString()` PRINTS 30 DECEMBER anywhere
 * west of Greenwich. The ISO short form is parsed as UTC midnight and then
 * rendered in local time, so every `@db.Date` column — an expiry, a term end, a
 * date of birth — reads a day early for a reader in New York and correctly for
 * one in Vienna. A date with no time on it has no time zone to be converted
 * between; building it from its parts keeps it the day it says it is.
 *
 * `undefined` locale on purpose: the reader's own, not a pinned one.
 */
export function formatCalendarDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '-';
  return new Date(y, m - 1, d).toLocaleDateString();
}

/**
 * The calendar day an instant falls on, as "YYYY-MM-DD" — in `timeZone` when
 * one is given (a workspace's day), else in the runtime's own zone.
 *
 * ⚠️ `toISOString().slice(0, 10)` is the UTC day: at 00:30 in Vienna it answers
 * YESTERDAY, so "today" opened on the wrong day for an hour or two every night.
 * An unknown zone falls back to the runtime's day rather than throwing.
 */
export function localDateKey(date: Date | string | number = new Date(), timeZone?: string | null): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  if (timeZone) {
    try {
      return partsDateKey(zonedParts(d, timeZone));
    } catch {
      /* unknown zone — the runtime's own day below */
    }
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Today as "YYYY-MM-DD" — in `timeZone` when given, else the runtime's. */
export function todayKey(timeZone?: string | null): string {
  return localDateKey(new Date(), timeZone);
}

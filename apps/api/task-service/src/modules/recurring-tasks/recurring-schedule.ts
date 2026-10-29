import { BadRequestException } from '@nestjs/common';
import { addDaysStr, localPartsIn, zonedWallTimeToUtc } from '@hbcfield/shared';

/** When a repeat runs: the fields each frequency needs, and the runs themselves. */

/**
 * Validate frequency-specific required fields
 */
export function validateFrequencyFields(
  frequency: string,
  data: { customDays?: number; dayOfWeek?: number; dayOfMonth?: number },
) {
  switch (frequency) {
    case 'CUSTOM':
      if (!data.customDays || data.customDays < 1) {
        throw new BadRequestException('CUSTOM frequency requires customDays >= 1');
      }
      break;
    case 'WEEKLY':
    case 'BIWEEKLY':
      if (data.dayOfWeek === undefined || data.dayOfWeek === null) {
        throw new BadRequestException(`${frequency} frequency requires dayOfWeek (0-6)`);
      }
      break;
    case 'MONTHLY':
    case 'QUARTERLY':
      if (data.dayOfMonth === undefined || data.dayOfMonth === null) {
        throw new BadRequestException(`${frequency} frequency requires dayOfMonth (1-31)`);
      }
      break;
  }
}

/** What a template says about WHEN — the frequency and the day it names. */
export interface RepeatRule {
  frequency: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  customDays?: number | null;
}

/*
  ⚠️ Every run is a DAY and a TIME in the workspace's zone, never the server's.

  The old rule added a period to `new Date()` with the container's (UTC) calendar:
  each run drifted to the minute the poller happened to tick, the start day itself
  never produced a job (the first run was start + one period), and "Monday" was
  Monday in London for a workspace in New York. Now: the first run is the start
  day (or the first day after it the rule names), and each next run is the
  PLANNED one plus a period — same wall-clock time, same weekday, in the zone.
*/

const MAX_STEPS = 100_000;

/** Calendar months on a YYYY-MM-DD, landing on `day` (clamped to the month's length). */
function addMonthsStr(dateStr: string, months: number, day: number): string {
  const [y, m] = dateStr.split('-').map(Number);
  const first = new Date(Date.UTC(y!, m! - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last))).toISOString().slice(0, 10);
}

/** The first day on or after `dateStr` that is weekday `dow` (0 = Sunday). */
function onOrAfterWeekday(dateStr: string, dow: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const today = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return addDaysStr(dateStr, (dow - today + 7) % 7);
}

const at = (dateStr: string, minutes: number, zone: string) =>
  zonedWallTimeToUtc(dateStr, Math.floor(minutes / 60), minutes % 60, zone);

/** The first run: the start day itself when the rule allows it, else the first day after it the rule names. */
export function firstRunAt(rule: RepeatRule, startDate: Date, zone: string): Date {
  const { dateStr, minutesOfDay } = localPartsIn(startDate, zone);
  let day = dateStr;
  const weekly = rule.frequency === 'WEEKLY' || rule.frequency === 'BIWEEKLY';
  const monthly = rule.frequency === 'MONTHLY' || rule.frequency === 'QUARTERLY';
  if (weekly && rule.dayOfWeek != null) day = onOrAfterWeekday(day, rule.dayOfWeek);
  if (monthly && rule.dayOfMonth != null) {
    // That day in the start's month, else the next month's.
    day = addMonthsStr(dateStr, 0, rule.dayOfMonth);
    if (day < dateStr) day = addMonthsStr(dateStr, 1, rule.dayOfMonth);
  }
  return at(day, minutesOfDay, zone);
}

/** The run after a PLANNED run — one period on, same wall-clock time, in the zone. */
export function nextRunAfter(rule: RepeatRule, planned: Date, zone: string): Date {
  const { dateStr, dom, minutesOfDay } = localPartsIn(planned, zone);
  let day: string;
  switch (rule.frequency) {
    case 'DAILY':
      day = addDaysStr(dateStr, 1);
      break;
    case 'WEEKLY':
    case 'BIWEEKLY': {
      const gap = rule.frequency === 'WEEKLY' ? 0 : 7;
      day = rule.dayOfWeek != null ? onOrAfterWeekday(addDaysStr(dateStr, 1), rule.dayOfWeek) : addDaysStr(dateStr, 7);
      day = addDaysStr(day, gap);
      break;
    }
    case 'MONTHLY':
      day = addMonthsStr(dateStr, 1, rule.dayOfMonth ?? dom);
      break;
    case 'QUARTERLY':
      day = addMonthsStr(dateStr, 3, rule.dayOfMonth ?? dom);
      break;
    case 'YEARLY':
      day = addMonthsStr(dateStr, 12, dom);
      break;
    default: // CUSTOM — never fewer than one day, or the loop below would not move.
      day = addDaysStr(dateStr, Math.max(1, rule.customDays ?? 1));
  }
  return at(day, minutesOfDay, zone);
}

/** The first planned run strictly after `floor`, walking from `planned` (runs missed while down collapse to one). */
export function nextRunPast(rule: RepeatRule, planned: Date, floor: Date, zone: string): Date {
  let next = planned;
  for (let i = 0; next.getTime() <= floor.getTime() && i < MAX_STEPS; i++) next = nextRunAfter(rule, next, zone);
  return next;
}

/** No run past the template's end: null = the repeat is over. */
export function withinEnd(next: Date | null, endDate: Date | null): Date | null {
  return next && endDate && next > endDate ? null : next;
}

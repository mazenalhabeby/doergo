import {
  REQUEST_LIMITS,
  requestKindOf,
  type RequestInputError,
  eachDay,
  type DateKey,
  toISODateString,
} from '@hbcfield/shared';
import { BadRequestException } from '@nestjs/common';

/** Availability ranges are capped so a far-future endDate cannot fan out N days × M people (L8). */
export const AVAILABILITY_MAX_SPAN_DAYS = 92;

/** A @db.Date value (UTC midnight) or an ISO string, as its calendar date. */
function dateKeyOf(v: Date | string): DateKey {
  return (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
}

/**
 * Which calendar days an availability request answers, each exactly once.
 *
 * Stepped as DATE KEYS (`eachDay`, the calendar module's walker), never as a local Date with
 * `setDate(+1)`: `new Date('2026-10-13')` is UTC midnight, and stepping it in the server's zone
 * moves it by 23 or 25 hours across a DST change — on 25 Oct in Vienna it lands at 01:00 UTC on
 * the 26th, past `end`, and the last day was silently dropped. West of UTC the same Date is the
 * evening BEFORE, so `getDay()` also named the wrong weekday. A date key has no zone.
 */
export function availabilityDays(q: { date?: string; startDate?: string; endDate?: string }, now = new Date()): DateKey[] {
  if (q.startDate && q.endDate) {
    const from = dateKeyOf(q.startDate);
    const to = dateKeyOf(q.endDate);
    const days = eachDay(from, to, AVAILABILITY_MAX_SPAN_DAYS + 2);
    if (days.length > AVAILABILITY_MAX_SPAN_DAYS + 1) {
      throw new BadRequestException(`Date range too large (max ${AVAILABILITY_MAX_SPAN_DAYS} days)`);
    }
    return days;
  }
  // Single day: the one asked for, else today — the same UTC date this endpoint always used.
  return [q.date ? dateKeyOf(q.date) : toISODateString(now)];
}

/** The workspace on a request, as every response carries it. */
const SPACE_BRIEF = { id: true, name: true } as const;

/** English fallbacks for the shared parser's coded refusals; clients translate by `code`. */
export const REQUEST_REFUSALS: Record<RequestInputError, string> = {
  REQUEST_KIND_INVALID: 'That is not a kind of request.',
  REQUEST_DATES_INVALID: 'Choose a start day on or before the end day.',
  REQUEST_TYPE_INVALID: 'That is not a kind of leave.',
  REQUEST_SPACE_REQUIRED: 'Choose the workspace.',
  REQUEST_TIME_INVALID: 'Give a start and/or end time (HH:MM), the end after the start.',
  REQUEST_MINUTES_INVALID: `Overtime is between ${REQUEST_LIMITS.OVERTIME_MIN_MINUTES} and ${REQUEST_LIMITS.OVERTIME_MAX_MINUTES} minutes.`,
  REQUEST_REASON_REQUIRED: 'Say what you are asking for.',
  REQUEST_REASON_TOO_LONG: `Keep the reason under ${REQUEST_LIMITS.REASON_MAX} characters.`,
  REQUEST_TOO_MANY_DAYS: `A remote request covers at most ${REQUEST_LIMITS.REMOTE_MAX_DAYS} days.`,
};

/** What a notification needs to name the request (the kind, where, the hours, the minutes). */
function requestFacts(r: {
  kind?: string | null;
  space?: { name: string } | null;
  startTime?: string | null;
  endTime?: string | null;
  minutes?: number | null;
}) {
  return {
    kind: requestKindOf(r.kind),
    spaceName: r.space?.name ?? null,
    startTime: r.startTime ?? null,
    endTime: r.endTime ?? null,
    minutes: r.minutes ?? null,
  };
}

export { dateKeyOf, SPACE_BRIEF, requestFacts };

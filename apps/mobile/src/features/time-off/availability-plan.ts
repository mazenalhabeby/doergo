import type { AvailabilityResponse } from '../../lib/api/types';
import { toDateString } from './helpers';

/**
 * WHAT TO ASK FOR when a range is picked on the Time off calendar.
 *
 * ⚠️ THIS WAS ONE REQUEST PER DAY, IN SEQUENCE — up to fourteen GETs every
 * time somebody tapped a second day, each waiting for the last, and the cache
 * the screen kept was never read before asking again. The server has always
 * answered a range in one go (`/employees/availability?startDate&endDate`,
 * one entry per day), so a pick is now ONE request for the days not already
 * known, and none at all when every day is.
 *
 * The span asked for is contiguous (first missing → last missing): one request
 * that re-reads a known day in the middle is cheaper than two.
 */
export const AVAILABILITY_MAX_DAYS = 14;

export interface AvailabilityPlan {
  /** The days the panel reads, in order — at most fourteen. */
  days: string[];
  /** Those the cache does not hold yet. */
  missing: string[];
  /** One request covering every missing day, or null when nothing needs asking. */
  fetch: { from: string; to: string } | null;
}

export function planAvailabilityFetch(
  rangeStart: Date,
  rangeEnd: Date,
  cache: Readonly<Record<string, AvailabilityResponse | undefined>>,
  maxDays: number = AVAILABILITY_MAX_DAYS,
): AvailabilityPlan {
  const days: string[] = [];
  const d = new Date(rangeStart);
  const end = new Date(rangeEnd);
  while (d <= end && days.length < maxDays) {
    days.push(toDateString(d));
    d.setDate(d.getDate() + 1);
  }
  const missing = days.filter((day) => !cache[day]);
  return {
    days,
    missing,
    fetch: missing.length ? { from: missing[0]!, to: missing[missing.length - 1]! } : null,
  };
}

/**
 * The answer laid into the cache, by its own `date` — never by position, so a
 * short or reordered answer cannot file one day's team under another.
 */
export function mergeAvailability(
  cache: Readonly<Record<string, AvailabilityResponse>>,
  answer: readonly AvailabilityResponse[] | null | undefined,
): Record<string, AvailabilityResponse> {
  if (!answer?.length) return cache as Record<string, AvailabilityResponse>;
  const next: Record<string, AvailabilityResponse> = { ...cache };
  for (const day of answer) {
    if (day && typeof day.date === 'string') next[day.date] = day;
  }
  return next;
}

/** An older server without the range form: 400/404 (anything else is a real failure). */
export function rangeUnsupported(err: unknown): boolean {
  const code = (err as { statusCode?: number } | null)?.statusCode;
  return code === 400 || code === 404;
}

/** Run `work` over `items`, at most `limit` at once. Failures are the caller's to absorb. */
export async function mapLimited<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await work(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return out;
}

/**
 * The days a ranged answer left out. The server steps days in its own zone, so
 * across a DST change the range form returns one day short; those days are
 * asked singly rather than silently missing from the panel.
 */
export function daysNotAnswered(asked: readonly string[], answer: readonly { date?: string | null }[]): string[] {
  const got = new Set(answer.map((a) => a.date).filter(Boolean));
  return asked.filter((d) => !got.has(d));
}

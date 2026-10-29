import { toISODateString } from '../utils/date';
import { partsDateKey, zonedParts } from '../utils/zone-parts';
/**
 * Wall-clock time in a place, as an absolute instant.
 *
 * A shift that reads "06:00" is six in the morning WHERE THE WORK IS, and the
 * instant that corresponds to differs by season and by site. Every deadline in
 * attendance — when a shift ends, when a rest falls due — is computed once, here,
 * into UTC, so that nothing downstream has to reason about a timezone again.
 *
 * Lifted out of ShiftResolverService, where it was private and correct, because
 * the rest engine needs exactly the same arithmetic and a second implementation
 * of "what time is 12:30 in Vienna" is a second chance to be an hour wrong twice
 * a year.
 */

export function tzOffsetMs(instant: Date, tz: string): number {
  try {
    const p = zonedParts(instant, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant.getTime();
  } catch {
    return 0; // An invalid zone is treated as UTC rather than throwing mid-shift.
  }
}

/**
 * The instant a wall time names in a zone — ONE answer at the two moments a year it is not obvious:
 *  - a wall time that does not exist (the spring-forward GAP) → the first instant AFTER the gap:
 *    Vienna 2026-03-29 02:30 → 03:00 local (01:00Z); New York 2026-03-08 02:30 → 03:00 EDT (07:00Z);
 *  - a wall time that happens twice (the autumn OVERLAP) → the FIRST time: Vienna 2026-10-25 02:30 →
 *    00:30Z; New York 2026-11-01 01:30 → 05:30Z.
 * The old two-pass guess answered a gap an hour early in one hemisphere and an hour late in the other,
 * and an overlap by whichever side the first guess happened to land on.
 */
export function zonedWallTimeToUtc(dateStr: string, hh: number, mm: number, tz: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const wall = Date.UTC(y!, mo! - 1, d!, hh, mm, 0);
  // The offsets either side of the day: a transition, if there is one, lies between them.
  const before = tzOffsetMs(new Date(wall - DAY_MS), tz);
  const after = tzOffsetMs(new Date(wall + DAY_MS), tz);
  const fits = (o: number) => tzOffsetMs(new Date(wall - o), tz) === o;
  const valid = [before, after].filter(fits).map((o) => wall - o);
  if (valid.length) return new Date(Math.min(...valid));
  if (before === after) return new Date(wall - before); // no transition near: cannot happen for a real zone
  // The gap: the transition instant, found to the minute. Before it the old offset holds (lo), after it the new (hi).
  let lo = Math.min(wall - before, wall - after);
  let hi = Math.max(wall - before, wall - after);
  while (hi - lo > MINUTE_MS) {
    const mid = lo + Math.floor((hi - lo) / 2 / MINUTE_MS) * MINUTE_MS;
    if (mid === lo) break;
    if (tzOffsetMs(new Date(mid), tz) === after) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** The local calendar parts of an instant in a zone. */
export interface LocalParts {
  /** YYYY-MM-DD as read in that zone. */
  dateStr: string;
  /** 0 = Sunday. */
  dow: number;
  /** Day of month. */
  dom: number;
  /** Minutes since local midnight. */
  minutesOfDay: number;
}

export function localPartsIn(instant: Date, tz: string): LocalParts {
  let dateStr: string;
  let minutesOfDay = 0;
  try {
    const p = zonedParts(instant, tz);
    dateStr = partsDateKey(p);
    minutesOfDay = p.hour * 60 + p.minute;
  } catch {
    dateStr = toISODateString(instant);
    minutesOfDay = instant.getUTCHours() * 60 + instant.getUTCMinutes();
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcMidnight = new Date(Date.UTC(y!, m! - 1, d!));
  return { dateStr, dow: utcMidnight.getUTCDay(), dom: d!, minutesOfDay };
}

/** "HH:MM" → [hours, minutes]; anything unparseable is midnight. */
export function parseHm(hm: string): [number, number] {
  const [h, m] = (hm ?? '').split(':').map(Number);
  return [Number.isFinite(h) ? h! : 0, Number.isFinite(m) ? m! : 0];
}

/** Calendar-day arithmetic on a YYYY-MM-DD string, timezone-free by design. */
export function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + days));
  return toISODateString(t);
}

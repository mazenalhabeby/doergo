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

export function zonedWallTimeToUtc(dateStr: string, hh: number, mm: number, tz: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const utcGuess = Date.UTC(y!, mo! - 1, d!, hh, mm, 0);
  const o1 = tzOffsetMs(new Date(utcGuess), tz);
  let result = utcGuess - o1;
  const o2 = tzOffsetMs(new Date(result), tz);
  if (o2 !== o1) result = utcGuess - o2;
  return new Date(result);
}

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

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

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    // Cached because building one costs far more than using it, and the sweep
    // asks the same handful of zones over and over.
    formatters.set(tz, f);
  }
  return f;
}

/** Milliseconds to add to a UTC instant to reach the given zone's wall clock. */
export function tzOffsetMs(instant: Date, tz: string): number {
  try {
    const parts = formatterFor(tz).formatToParts(instant);
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
    const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    return asUTC - instant.getTime();
  } catch {
    return 0; // An invalid zone is treated as UTC rather than throwing mid-shift.
  }
}

/**
 * "2026-09-06", 12, 30, "Europe/Vienna" → the instant that is 12:30 there.
 *
 * Two passes on purpose. The offset is read at a naive guess, and then again at
 * the result: across a daylight-saving boundary those differ, and a single pass
 * puts the answer an hour out on exactly the two days a year when somebody is
 * most likely to be working a night shift.
 */
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
    const parts = formatterFor(tz).formatToParts(instant);
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
    dateStr = `${g('year')}-${g('month')}-${g('day')}`;
    minutesOfDay = Number(g('hour')) * 60 + Number(g('minute'));
  } catch {
    dateStr = instant.toISOString().slice(0, 10);
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
  return t.toISOString().slice(0, 10);
}

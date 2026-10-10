/**
 * Reading an instant's wall clock in an IANA zone — the one place it is done.
 *
 * Four copies existed in this package (the attendance offset maths, the local
 * calendar parts, the datetime-input conversion, and `localDateKey`), each with
 * its own cached Intl formatter; one of them forgot that some engines print
 * midnight as hour "24". A leaf module with no imports, so every date module
 * can build on it without an import cycle.
 */

/** Two digits, zero-padded. */
export const pad2 = (n: number): string => String(n).padStart(2, '0');

const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * The cached formatter for a zone. Cached because building one costs far more
 * than using it. ⚠️ Throws on an unknown zone — callers choose their fallback.
 * en-US is load-bearing: the parts are parsed back as numbers.
 */
export function zoneFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** An instant's wall-clock parts in `tz`. ⚠️ Throws on an unknown zone. */
export function zonedParts(instant: Date, tz: string): ZonedParts {
  const m: Record<string, number> = {};
  for (const p of zoneFormatter(tz).formatToParts(instant)) if (p.type !== 'literal') m[p.type] = Number(p.value);
  return {
    year: m.year ?? 0,
    month: m.month ?? 1,
    day: m.day ?? 1,
    // `% 24`: some engines print midnight as "24" even with h23.
    hour: (m.hour ?? 0) % 24,
    minute: m.minute ?? 0,
    second: m.second ?? 0,
  };
}

/** "YYYY-MM-DD" of a set of zoned parts. */
export const partsDateKey = (p: ZonedParts): string => `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;

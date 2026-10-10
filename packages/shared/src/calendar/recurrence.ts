/**
 * Repeating events, kept deliberately small: daily, weekly (on chosen weekdays), monthly, yearly,
 * every N, until a day or for N times. Stored as JSON, never as a free RRULE string, so the server
 * validates a closed shape and nothing exotic can make an expansion loop forever. The ICS feed
 * turns it into an RRULE on the way out.
 *
 * Occurrences repeat at the same WALL time in the event's zone — a 09:00 stand-up is still at 09:00
 * after the clocks change.
 */
import { addDaysStr, localPartsIn, zonedWallTimeToUtc } from '../attendance/zoned-time';
import { toISODateString } from '../utils/date';

export type RepeatFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface Repeat {
  freq: RepeatFreq;
  /** Every N days/weeks/months/years, 1 … 52. */
  interval: number;
  /** WEEKLY only: 0 = Sunday … 6 = Saturday. Empty = the start's weekday. */
  byDay?: number[];
  /** Last day an occurrence may START on (local date, inclusive). */
  until?: string | null;
  /** Or: stop after this many occurrences, 1 … 500. */
  count?: number | null;
}

export const REPEAT_MAX_COUNT = 500;
/** No expansion ever returns more than this many occurrences. */
const EMIT_CAP = 1000;
/**
 * Steps walked from the series start. Walking is string arithmetic only — the zone conversion is
 * paid just near the window — so a daily series a century long stays cheap.
 */
const STEP_CAP = 40000;

/** Validate a repeat rule from a request. Returns null for "doesn't repeat", throws on nonsense. */
export function parseRepeat(input: unknown): Repeat | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object') throw new Error('REPEAT_INVALID');
  const r = input as Record<string, unknown>;
  const freq = r.freq;
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') throw new Error('REPEAT_INVALID');
  const interval = r.interval === undefined ? 1 : Number(r.interval);
  if (!Number.isInteger(interval) || interval < 1 || interval > 52) throw new Error('REPEAT_INVALID');
  let byDay: number[] | undefined;
  if (r.byDay !== undefined && r.byDay !== null) {
    if (!Array.isArray(r.byDay) || r.byDay.some((d) => !Number.isInteger(d) || (d as number) < 0 || (d as number) > 6)) throw new Error('REPEAT_INVALID');
    byDay = [...new Set(r.byDay as number[])].sort();
  }
  let until: string | null = null;
  if (r.until !== undefined && r.until !== null && r.until !== '') {
    if (typeof r.until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.until)) throw new Error('REPEAT_INVALID');
    until = r.until;
  }
  let count: number | null = null;
  if (r.count !== undefined && r.count !== null) {
    count = Number(r.count);
    if (!Number.isInteger(count) || count < 1 || count > REPEAT_MAX_COUNT) throw new Error('REPEAT_INVALID');
  }
  return { freq, interval, ...(freq === 'WEEKLY' && byDay?.length ? { byDay } : {}), until, count };
}

function addMonthsStr(dateStr: string, months: number): string | null {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  // The 31st does not exist every month — skip that month rather than drifting to the 1st.
  if (d! > last) return null;
  t.setUTCDate(d!);
  return toISODateString(t);
}

/**
 * Every occurrence START that overlaps [from, to), in order. `durationMs` lets an occurrence that
 * began just before `from` and is still running be included.
 */
export function occurrences(
  startAt: Date,
  durationMs: number,
  repeat: Repeat | null,
  tz: string,
  from: Date,
  to: Date,
): Date[] {
  const overlaps = (s: Date) => s.getTime() < to.getTime() && s.getTime() + Math.max(durationMs, 1) > from.getTime();
  if (!repeat) return overlaps(startAt) ? [startAt] : [];
  const local = localPartsIn(startAt, tz);
  const hh = Math.floor(local.minutesOfDay / 60);
  const mm = local.minutesOfDay % 60;
  const at = (dateStr: string) => zonedWallTimeToUtc(dateStr, hh, mm, tz);
  /*
    ⚠️ The cap counts what is RETURNED, never what was walked. Counting from the series start made
    an open-ended daily stand-up vanish after ~2.7 years and cost a thousand zone conversions per
    event per read. Dates well before the window are counted (for `count`) and skipped without
    converting; an occurrence can start up to 15 days before `from` and still overlap (an event
    lasts at most 14 days).
  */
  const skipBefore = addDaysStr(localPartsIn(from, tz).dateStr, -16);
  const stopAfter = addDaysStr(localPartsIn(to, tz).dateStr, 1);
  const out: Date[] = [];
  let produced = 0;

  /** false = the series (or the window) has ended. */
  const emit = (dateStr: string): boolean => {
    if (repeat.until && dateStr > repeat.until) return false;
    if (repeat.count && produced >= repeat.count) return false;
    if (dateStr > stopAfter) return false;
    produced++;
    if (dateStr < skipBefore) return true;
    const s = at(dateStr);
    if (s.getTime() >= to.getTime()) return false;
    if (overlaps(s)) out.push(s);
    return out.length < EMIT_CAP;
  };

  if (repeat.freq === 'WEEKLY') {
    const days = repeat.byDay?.length ? repeat.byDay : [local.dow];
    let weekStart = addDaysStr(local.dateStr, -local.dow);
    for (let w = 0; w < STEP_CAP; w++) {
      for (const d of days) {
        const dateStr = addDaysStr(weekStart, d);
        if (dateStr < local.dateStr) continue;
        if (!emit(dateStr)) return out;
      }
      weekStart = addDaysStr(weekStart, 7 * repeat.interval);
    }
    return out;
  }

  for (let i = 0; i < STEP_CAP; i++) {
    let dateStr: string | null;
    if (repeat.freq === 'DAILY') dateStr = addDaysStr(local.dateStr, i * repeat.interval);
    else if (repeat.freq === 'MONTHLY') dateStr = addMonthsStr(local.dateStr, i * repeat.interval);
    else dateStr = addMonthsStr(local.dateStr, i * 12 * repeat.interval);
    if (dateStr === null) continue;
    if (!emit(dateStr)) return out;
  }
  return out;
}

/** RRULE text for the ICS feed. An all-day series ends on a DATE (RFC 5545 forbids a time there). */
export function repeatToRrule(r: Repeat, allDay = false): string {
  const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const parts = [`FREQ=${r.freq}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.freq === 'WEEKLY' && r.byDay?.length) parts.push(`BYDAY=${r.byDay.map((d) => DAYS[d]).join(',')}`);
  if (r.until) parts.push(allDay ? `UNTIL=${r.until.replace(/-/g, '')}` : `UNTIL=${r.until.replace(/-/g, '')}T235959Z`);
  else if (r.count) parts.push(`COUNT=${r.count}`);
  return parts.join(';');
}

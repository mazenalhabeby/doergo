/**
 * Public holidays: the country's list, then what the organization changed about it.
 *
 * The list itself comes from an offline library on the server (no calls out, no per-request cost).
 * What lives in the database is only the organization's DIFFERENCE from it — a confirmed or moved
 * Eid, a holiday they do not observe, a company day off. So next year's list arrives on its own and
 * an override only ever touches the year it was made for.
 */
import type { DateKey } from '../attendance/cover';
import { addDaysStr } from '../attendance/zoned-time';
import type { HolidayDay } from './days';

/**
 * Holidays fixed by the Hijri calendar are announced on a moon sighting, so any date computed in
 * advance is an estimate that can move by a day. They are flagged until somebody confirms them —
 * a leave request counted against a guessed Eid would otherwise be silently wrong.
 */
const HIJRI_MONTH = /\b(muharram|safar|rabi|jumada|rajab|sha.?ban|ramadan|shawwal|dhu.?al)/i;

export function isEstimatedRule(rule: string | null | undefined): boolean {
  return !!rule && HIJRI_MONTH.test(rule);
}

/** "9 Dhu al-Hijjah P4D" → 4. A rule without a duration is one day. Capped: a library typo is not a month off. */
export function ruleDurationDays(rule: string | null | undefined): number {
  const m = /\bP(\d{1,2})D\b/.exec(rule ?? '');
  const n = m ? Number(m[1]) : 1;
  return Math.min(Math.max(n, 1), 14);
}

/** A stable key for one library holiday in one year — what an override points at. */
export function libraryHolidayKey(year: number, rule: string): string {
  return `${year}:${rule.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80)}`;
}

/** One holiday as the library computed it. */
export interface LibraryHoliday {
  key: string;
  date: DateKey;
  days: number;
  name: string;
  estimated: boolean;
}

/** One row the organization saved. `libraryKey` set = a change to a library holiday; null = their own day. */
export interface HolidayOverride {
  id: string;
  libraryKey: string | null;
  date: DateKey;
  days: number;
  name: string;
  halfDay: boolean;
  /** "We don't observe this one." */
  removed: boolean;
  /** An estimated holiday somebody has checked. */
  confirmed: boolean;
}

export type HolidayStatus = 'ESTIMATED' | 'CONFIRMED' | 'FIXED';

/** A holiday as a screen shows it and a count uses it. */
export interface ResolvedHoliday {
  /** The override's id when one exists — what Edit / Remove act on. */
  id: string | null;
  key: string;
  date: DateKey;
  endDate: DateKey;
  days: number;
  name: string;
  kind: 'PUBLIC' | 'COMPANY';
  status: HolidayStatus;
  halfDay: boolean;
  /** Moved, renamed or confirmed by the organization. */
  changed: boolean;
}

/**
 * Apply the organization's changes to the library's list.
 * Removed holidays are returned only when `includeRemoved` (the settings screen lists them so they
 * can be restored); every count and calendar leaves them out.
 */
export function mergeHolidays(
  library: readonly LibraryHoliday[],
  overrides: readonly HolidayOverride[],
  includeRemoved = false,
): (ResolvedHoliday & { removed?: boolean })[] {
  const byKey = new Map<string, HolidayOverride>();
  for (const o of overrides) if (o.libraryKey) byKey.set(o.libraryKey, o);
  const out: (ResolvedHoliday & { removed?: boolean })[] = [];
  for (const h of library) {
    const o = byKey.get(h.key);
    if (o?.removed && !includeRemoved) continue;
    const date = o ? o.date : h.date;
    const days = o ? o.days : h.days;
    out.push({
      id: o?.id ?? null,
      key: h.key,
      date,
      endDate: addDaysStr(date, days - 1),
      days,
      name: o?.name || h.name,
      kind: 'PUBLIC',
      status: !h.estimated ? 'FIXED' : o?.confirmed ? 'CONFIRMED' : 'ESTIMATED',
      halfDay: o?.halfDay ?? false,
      changed: !!o,
      ...(o?.removed ? { removed: true } : {}),
    });
  }
  for (const o of overrides) {
    if (o.libraryKey || o.removed) continue;
    out.push({
      id: o.id,
      key: `company:${o.id}`,
      date: o.date,
      endDate: addDaysStr(o.date, o.days - 1),
      days: o.days,
      name: o.name,
      kind: 'COMPANY',
      status: 'FIXED',
      halfDay: o.halfDay,
      changed: true,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
}

/** Multi-day holidays → one entry per day, for counting and shading. */
export function holidayDays(list: readonly ResolvedHoliday[]): HolidayDay[] {
  const out: HolidayDay[] = [];
  for (const h of list) {
    for (let i = 0; i < h.days; i++) {
      out.push({
        day: addDaysStr(h.date, i),
        key: h.key,
        name: h.name,
        kind: h.kind,
        halfDay: h.halfDay,
        estimated: h.status === 'ESTIMATED',
      });
    }
  }
  return out;
}

/** What a holiday row may hold when somebody saves one. */
export const HOLIDAY_NAME_MAX = 80;
export const HOLIDAY_MAX_DAYS = 14;

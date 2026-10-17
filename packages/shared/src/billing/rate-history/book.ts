/** Dated rates: one row of history, day keys, and the book that answers which rate was in force on a day. */
import { localDateKey, toISODateString } from '../../utils/date';
import { zoneOf } from '../../utils/workspace-zone';

export type RateTargetKind = 'ORGANIZATION' | 'SPACE' | 'MEMBER' | 'ASSIGNMENT' | 'ROLE';

export type RateHistoryKind = 'BILL_HOUR' | 'COST_HOUR' | 'BILL_DAY' | 'COST_DAY';

/** One dated rate. `effectiveFrom` is a calendar day, `YYYY-MM-DD`. */
export interface RateHistoryRow {
  target: RateTargetKind;
  targetId: string;
  /** ROLE rows: the workspace the day rate applies in. */
  spaceId?: string | null;
  kind: RateHistoryKind;
  /** Null = cleared from that day, so the next level of the ladder applies. */
  cents: number | null;
  effectiveFrom: string;
  /** Tie-break when two rows start on the same day: the later write wins. */
  createdAt?: string | Date | null;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A calendar day as `YYYY-MM-DD`, or null for anything that is not a real day ("2026-02-30"). */
export function parseDayKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = DAY_RE.exec(raw.trim());
  if (!m) return null;
  const y = +m[1]!, mo = +m[2]!, d = +m[3]!;
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** A Postgres DATE (read back as UTC midnight) or a key, as a key. */
export function dayKeyOfDate(value: Date | string): string {
  if (typeof value === 'string') return parseDayKey(value) ?? value.slice(0, 10);
  return toISODateString(value);
}

/** The calendar day an instant falls on in a time zone — where the work happened. */
export function dayKeyIn(instant: Date, timeZone: string | null | undefined): string {
  return localDateKey(instant, zoneOf(timeZone));
}

/** A row's identity for grouping: the same record, rate kind and workspace. */
export function rateSeriesKey(target: RateTargetKind, targetId: string, kind: RateHistoryKind, spaceId?: string | null): string {
  return `${target}|${targetId}|${kind}|${spaceId ?? ''}`;
}

const createdMs = (r: RateHistoryRow) => (r.createdAt ? new Date(r.createdAt).getTime() : 0);

/** Newest first: by start day, then by write time. */
function compareNewestFirst(a: RateHistoryRow, b: RateHistoryRow): number {
  if (a.effectiveFrom !== b.effectiveFrom) return a.effectiveFrom < b.effectiveFrom ? 1 : -1;
  return createdMs(b) - createdMs(a);
}

/**
 * Rows grouped into series, each sorted newest first, ready for `rateOn`.
 *
 * One pass over whatever one query returned — the invoice loads every rate it
 * could need in a single round trip and asks this for each line.
 */
export class RateBook {
  private readonly series = new Map<string, RateHistoryRow[]>();

  constructor(rows: RateHistoryRow[] = []) {
    for (const r of rows) {
      const key = rateSeriesKey(r.target, r.targetId, r.kind, r.spaceId);
      const list = this.series.get(key);
      if (list) list.push(r);
      else this.series.set(key, [r]);
    }
    for (const list of this.series.values()) list.sort(compareNewestFirst);
  }

  /** Does this record have any dated history for this kind at all? */
  has(target: RateTargetKind, targetId: string, kind: RateHistoryKind, spaceId?: string | null): boolean {
    return this.series.has(rateSeriesKey(target, targetId, kind, spaceId));
  }

  /**
   * The rate in force on `day`.
   *
   * - Rows exist and one started on or before the day → that row's cents (null
   *   if it was a clearing row).
   * - Rows exist but all start later → null: nothing applied yet.
   * - No rows at all → `fallback`, the record's own column. Every rate set before
   *   history existed was backfilled, so this only matters for a row written by
   *   an old code path — and then the column is the honest answer.
   */
  on(
    day: string,
    target: RateTargetKind,
    targetId: string | null | undefined,
    kind: RateHistoryKind,
    fallback: number | null | undefined = null,
    spaceId?: string | null,
  ): number | null {
    if (!targetId) return null;
    const list = this.series.get(rateSeriesKey(target, targetId, kind, spaceId));
    if (!list || list.length === 0) return fallback ?? null;
    for (const r of list) if (r.effectiveFrom <= day) return r.cents;
    return null;
  }

  /** Every row of one series, oldest first — what a "rate history" panel lists. */
  timeline(target: RateTargetKind, targetId: string, kind: RateHistoryKind, spaceId?: string | null): RateHistoryRow[] {
    return [...(this.series.get(rateSeriesKey(target, targetId, kind, spaceId)) ?? [])].reverse();
  }

  /**
   * The days in `days` (sorted keys) split into runs that share one rate.
   *
   * What makes "7 days at $200, 4 days at $220" two invoice rows instead of an
   * averaged number nobody can check.
   */
  splitDays(
    days: string[],
    target: RateTargetKind,
    targetId: string,
    kind: RateHistoryKind,
    spaceId?: string | null,
    fallback: number | null = null,
  ): Array<{ fromDay: string; toDay: string; days: number; cents: number | null }> {
    return this.splitDaysWith(days, (day) => this.on(day, target, targetId, kind, fallback, spaceId));
  }

  /**
   * A work role's day rate on a day, in a workspace: that workspace's own rate
   * where one applies, else the role's default for every workspace.
   *
   * A workspace rate that has not started yet, or was cleared, falls back to
   * the default — "inherit", the same meaning a null has everywhere else.
   */
  dayRateOn(day: string, roleId: string, spaceId: string | null): number | null {
    const own = spaceId ? this.on(day, 'ROLE', roleId, 'BILL_DAY', null, spaceId) : null;
    return own ?? this.on(day, 'ROLE', roleId, 'BILL_DAY', null, null);
  }

  /**
   * What a DAY of this person costs you on `day` — from their profile, the one
   * place a cost lives (rate-ladder `LEVELS_BY_KIND`). Null = no day cost set —
   * unknown, never free. One answer for the invoice margin and the worker's
   * statement. `_assignmentId` is accepted and ignored: a per-workspace day cost
   * is no longer read, so an old one cannot win.
   */
  personDayCostOn(day: string, memberId: string, _assignmentId?: string | null): number | null {
    void _assignmentId;
    return this.on(day, 'MEMBER', memberId, 'COST_DAY', null);
  }

  /** Which of the two answered `dayRateOn` — for a screen that has to explain itself. */
  dayRateSourceOn(day: string, roleId: string, spaceId: string | null): 'workspace' | 'default' | null {
    if (spaceId && this.on(day, 'ROLE', roleId, 'BILL_DAY', null, spaceId) !== null) return 'workspace';
    return this.on(day, 'ROLE', roleId, 'BILL_DAY', null, null) !== null ? 'default' : null;
  }

  /** Sorted days split into runs that share one rate, the rate decided per day by `centsOn`. */
  splitDaysWith(
    days: string[],
    centsOn: (day: string) => number | null,
  ): Array<{ fromDay: string; toDay: string; days: number; cents: number | null }> {
    const out: Array<{ fromDay: string; toDay: string; days: number; cents: number | null }> = [];
    for (const day of [...new Set(days)].sort()) {
      const cents = centsOn(day);
      const last = out[out.length - 1];
      if (last && last.cents === cents) {
        last.toDay = day;
        last.days += 1;
      } else {
        out.push({ fromDay: day, toDay: day, days: 1, cents });
      }
    }
    return out;
  }
}

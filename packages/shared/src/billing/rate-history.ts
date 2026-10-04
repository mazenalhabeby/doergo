/**
 * Rates over time.
 *
 * ⚠️ A RATE CHANGE NEVER REWRITES THE PAST. Raising the Mechanic day rate from
 * $200 to $220 "from 1 November" adds a dated row; every day worked before
 * 1 November is still priced at $200 — on an invoice raised today, next week or
 * next year. Writing the new number over the old one would silently re-price
 * work that a client may already have agreed to, and the first person to notice
 * is holding two documents that disagree.
 *
 * Issued invoices were already safe (each line keeps its own copy of the rate),
 * but work that had not been invoiced yet was not: a draft raised after a change
 * picked up the new rate for old days. Pricing every piece of work by the rate
 * in force ON THE DAY IT WAS DONE closes that gap, and it is one rule for hours
 * and days alike.
 *
 * Everything here is pure: the services load the rows, these functions decide.
 */

import { localPartsIn } from '../attendance/zoned-time';
import { cleanRateCents } from './rate-ladder';

export type RateTargetKind = 'ORGANIZATION' | 'SPACE' | 'MEMBER' | 'ASSIGNMENT' | 'ROLE';
export type RateHistoryKind = 'BILL_HOUR' | 'COST_HOUR' | 'BILL_DAY';

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
  return value.toISOString().slice(0, 10);
}

/** The calendar day an instant falls on in a time zone — where the work happened. */
export function dayKeyIn(instant: Date, timeZone: string | null | undefined): string {
  return localPartsIn(instant, timeZone || 'UTC').dateStr;
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
    const out: Array<{ fromDay: string; toDay: string; days: number; cents: number | null }> = [];
    for (const day of [...days].sort()) {
      const cents = this.on(day, target, targetId, kind, fallback, spaceId);
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

/**
 * A requested start day, checked.
 *
 * ⚠️ BOUNDED BOTH WAYS. Back-dating a rate re-prices un-invoiced work already
 * done — that is sometimes the whole point (a raise agreed last week), so it is
 * allowed, but not into a past nobody could reason about. Forward, a year is
 * plenty for a scheduled change; further is a typo.
 */
export const RATE_BACKDATE_MAX_DAYS = 366;
/** The start day of a rate that has applied for as long as the record has existed. */
export const SINCE_ALWAYS = '1970-01-01';
export const RATE_FUTURE_MAX_DAYS = 366;

export function rateStartProblem(day: string | null, today: string): 'INVALID' | 'TOO_OLD' | 'TOO_FAR' | null {
  if (!day) return 'INVALID';
  const ms = (k: string) => Date.parse(`${k}T00:00:00Z`);
  const diffDays = Math.round((ms(day) - ms(today)) / 86_400_000);
  if (diffDays < -RATE_BACKDATE_MAX_DAYS) return 'TOO_OLD';
  if (diffDays > RATE_FUTURE_MAX_DAYS) return 'TOO_FAR';
  return null;
}

/** Today as a calendar day in UTC — the server's notion of "today" for a rate with no zone. */
export function utcTodayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * What to write when a rate changes. ONE function for every rate path, so the
 * four places that edit an hourly rate and the role day rate cannot drift on
 * what a change records.
 *
 * Returns the history row to insert. The record's own column (the "rate now"
 * mirror) is then set by the caller to `RateBook.on(today)` over the WHOLE
 * series — not to this value — because a back-dated change can sit behind a
 * later one, and a change scheduled for next month must leave today's figure
 * alone.
 */
export function planRateChange(input: {
  organizationId: string;
  target: RateTargetKind;
  targetId: string;
  kind: RateHistoryKind;
  spaceId?: string | null;
  cents: unknown;
  effectiveFrom?: unknown;
  createdById?: string | null;
  today?: string;
  /**
   * The FIRST rate this record has ever had, saved without a start day.
   *
   * ⚠️ It applies since always, not from today. Before dated rates, setting a
   * workspace's rate for the first time priced every job not yet invoiced; a
   * first rate dated "today" would instead leave last month's work with no rate
   * at all and bill it at nothing. Later changes start on their day.
   */
  sinceAlways?: boolean;
}): {
  row: {
    organizationId: string;
    target: RateTargetKind;
    targetId: string;
    kind: RateHistoryKind;
    spaceId: string | null;
    cents: number | null;
    effectiveFrom: Date;
    createdById: string | null;
  };
  cents: number | null;
  effectiveFrom: string;
} {
  const today = input.today ?? utcTodayKey();
  const unspecified = input.effectiveFrom === undefined || input.effectiveFrom === null || input.effectiveFrom === '';
  const requested = unspecified ? (input.sinceAlways ? SINCE_ALWAYS : today) : parseDayKey(input.effectiveFrom);
  const problem = unspecified && input.sinceAlways ? null : rateStartProblem(requested, today);
  if (problem) throw new RateChangeError(problem);
  const day = requested!;
  const cents = cleanRateCents(input.cents);
  return {
    row: {
      organizationId: input.organizationId,
      target: input.target,
      targetId: input.targetId,
      kind: input.kind,
      spaceId: input.spaceId ?? null,
      cents,
      effectiveFrom: new Date(`${day}T00:00:00Z`),
      createdById: input.createdById ?? null,
    },
    cents,
    effectiveFrom: day,
  };
}

export class RateChangeError extends Error {
  constructor(public readonly code: 'INVALID' | 'TOO_OLD' | 'TOO_FAR') {
    super(
      code === 'INVALID'
        ? 'The start date must be a real day (YYYY-MM-DD)'
        : code === 'TOO_OLD'
          ? `A rate can start at most ${RATE_BACKDATE_MAX_DAYS} days in the past`
          : `A rate can be scheduled at most ${RATE_FUTURE_MAX_DAYS} days ahead`,
    );
  }
}

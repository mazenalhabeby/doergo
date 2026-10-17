/** Planning a rate change: how far back and forward it may start, and the plan the one writer runs. */
import { toISODateString } from '../../utils/date';
import { cleanRateCents } from '../rate-ladder';
import { parseDayKey, type RateHistoryKind, type RateTargetKind } from './book';

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
  return toISODateString(now);
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

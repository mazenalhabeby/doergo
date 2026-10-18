/**
 * The nightly label check: work an entry's labels out again from its own
 * labelFacts with the SAME rules the clock used, and say where the stored
 * labels or approval disagree. Pure — the server reads, this decides.
 *
 * Only labels the facts can fully explain are compared (CHECKED_LABELS);
 * labels about how an entry was recorded, rests left untaken, or a close
 * that was temporary are owned by other rules and are never second-guessed
 * here. Plan: docs/plans/clock-attendance-2026-10.md step 4.
 */
import { flagsAgainstDailyLimit, computeScheduleFlags } from '../../utils/attendance-flags';
import { flagsForReview } from '../../sync/occurrence';
import { readLabelFacts } from './facts';
import { arrivalFlags } from './rules-time';
import type { LabelCode, PositionFact } from './contract';

/** The labels the facts decide on their own. */
export const CHECKED_LABELS: ReadonlySet<LabelCode> = new Set<LabelCode>([
  'LATE_ARRIVAL',
  'LATE_FROM_REST',
  'EARLY_DEPARTURE',
  'OVERTIME',
  'PAST_DAILY_LIMIT',
  'OUTSIDE_GEOFENCE_IN',
  'OUTSIDE_GEOFENCE_OUT',
]);

/** Outside at clock-in may stand as either word: flagged, or agreed in advance. */
const OUTSIDE_IN_WORDS = ['OUTSIDE_GEOFENCE_IN', 'APPROVED_REMOTE'];

export interface LabelCheckEntry {
  clockInAt: Date;
  clockOutAt: Date | null;
  flagReasons: readonly string[];
  approvalStatus: string | null;
  /** A person approved or refused it — their decision stands whatever the labels say. */
  decidedByPerson: boolean;
  labelFacts: unknown;
}

export interface LabelCheckFinding {
  expected: { labels: string[]; approval?: 'PENDING' };
  actual: { labels: string[]; approval: string | null };
  /** Expected but not on the entry. */
  missing: string[];
  /** On the entry but the facts do not explain it. */
  unexpected: string[];
}

const outsideBy = (fact: PositionFact | undefined): boolean | null =>
  fact?.judged ? (fact.metresOutside ?? 0) > 0 : null;

/** The checked labels the facts give, in no particular order. */
export function expectedLabels(
  entry: Pick<LabelCheckEntry, 'clockInAt' | 'clockOutAt' | 'labelFacts'>,
): string[] | null {
  const facts = readLabelFacts(entry.labelFacts);
  if (!facts) return null;
  const out: string[] = [];
  const shift = facts.shift;
  if (shift) {
    out.push(
      ...arrivalFlags({
        firstOfShift: facts.firstOfShift,
        clockInAt: entry.clockInAt,
        expectedClockInAt: new Date(shift.expectedStartAt),
        toleranceMin: shift.toleranceMin,
      }),
    );
    if (entry.clockOutAt && shift.expectedEndAt) {
      const flags = computeScheduleFlags({
        clockOutAt: entry.clockOutAt,
        expectedClockOutAt: new Date(shift.expectedEndAt),
        toleranceMin: shift.toleranceMin,
      });
      out.push(...flagsAgainstDailyLimit(flags, shift.endIsDailyLimit));
    }
  }
  if (facts.rest && facts.rest.overMin > 0) out.push('LATE_FROM_REST');
  if (outsideBy(facts.clockIn) === true) out.push('OUTSIDE_GEOFENCE_IN');
  if (outsideBy(facts.clockOut) === true) out.push('OUTSIDE_GEOFENCE_OUT');
  return out;
}

/**
 * Null when the entry agrees with its facts, or carries none. A disagreement
 * on a position that was not judged is never reported — nothing was decided.
 */
export function checkEntryLabels(entry: LabelCheckEntry): LabelCheckFinding | null {
  const expected = expectedLabels(entry);
  if (!expected) return null;
  const facts = readLabelFacts(entry.labelFacts)!;
  const stored = new Set(entry.flagReasons);
  const missing: string[] = [];
  const unexpected: string[] = [];

  for (const code of CHECKED_LABELS) {
    const want = expected.includes(code);
    let have = stored.has(code);
    if (code === 'OUTSIDE_GEOFENCE_IN') {
      if (outsideBy(facts.clockIn) === null) continue;
      have = OUTSIDE_IN_WORDS.some((w) => stored.has(w));
    }
    if (code === 'OUTSIDE_GEOFENCE_OUT' && outsideBy(facts.clockOut) === null) continue;
    if (want && !have) missing.push(code);
    if (!want && have) unexpected.push(code);
  }

  // Something waiting for a person was let through on its own: the one approval disagreement that matters.
  const autoWithReview =
    !entry.decidedByPerson && entry.approvalStatus === 'AUTO' && flagsForReview([...stored]).length > 0;
  if (!missing.length && !unexpected.length && !autoWithReview) return null;
  return {
    expected: { labels: expected.sort(), ...(autoWithReview ? { approval: 'PENDING' as const } : {}) },
    actual: { labels: [...stored].sort(), approval: entry.approvalStatus },
    missing,
    unexpected,
  };
}

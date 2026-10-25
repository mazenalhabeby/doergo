/** What a member's tap does to the plan: a rest taken, snoozed, missed — and the flag for a required rest missed. */
import { ATTENDANCE_FLAG_REASONS } from '../../constants/attendance';
import { MAX_SNOOZES_DEFAULT, MIN_SNOOZE_MINUTES, outstandingBreaks, type BreakPlanItem } from './plan';

/**
 * Does a rest tapped at `at` satisfy this planned rest?
 *
 * ⚠️ Not simply "the next one". A 09:00 coffee used to be filed as lunch — lunch
 * went TAKEN, the midday prompt never came, the coffee inherited lunch's
 * paid/unpaid setting, and at 12:30 the member was on the floor with their
 * required rest recorded as done.
 *
 * So a tap counts only while the rest is actually due: from its due time, less a
 * small lead (its own "Later" interval — the member who goes five minutes before
 * the prompt is taking that rest, not another one), until its window closes. A
 * SNOOZED rest has already fallen due, so any tap before the window closes is
 * it. A rest with no deadline stays satisfiable for the rest of the shift once
 * due. Outside that, the tap is an unplanned break: allowed, recorded, and never
 * counted as work.
 *
 * Pure, so the phone can ask the same question before it sends the tap.
 */
export function tapSatisfiesPlannedRest(item: BreakPlanItem, at: Date): boolean {
  if (item.state !== 'PENDING' && item.state !== 'SNOOZED') return false;
  const t = at.getTime();
  if (item.expiresAt && t > new Date(item.expiresAt).getTime()) return false;
  if (item.state === 'SNOOZED') return true;
  const leadMin = Math.max(MIN_SNOOZE_MINUTES, Math.round(item.snoozeMin || 0));
  return t >= new Date(item.dueAt).getTime() - leadMin * 60_000;
}

/**
 * Which planned rest a rest started at `at` is, or null for an unplanned break.
 *
 * Named (the member answered a prompt, which carries the rule) wins — but only
 * while that rest is still outstanding; naming one already taken is a second
 * rest, not the same one twice. Unnamed, the earliest outstanding rest the tap
 * falls inside the window of (`tapSatisfiesPlannedRest`).
 */
export function plannedRestForTap(
  plan: BreakPlanItem[],
  opts: { ruleId?: string | null; at: Date },
): BreakPlanItem | null {
  if (opts.ruleId) {
    const named = plan.find((i) => i.ruleId === opts.ruleId);
    return named && (named.state === 'PENDING' || named.state === 'SNOOZED') ? named : null;
  }
  return outstandingBreaks(plan).find((i) => tapSatisfiesPlannedRest(i, opts.at)) ?? null;
}

/** A rest that was never taken and can no longer be. */
export function isExpired(item: BreakPlanItem, now: Date): boolean {
  return !!item.expiresAt && new Date(item.expiresAt).getTime() <= now.getTime();
}

/**
 * "Later." Push it out by the rule's interval, or record it as missed once the
 * cap is reached.
 *
 * Returns a NEW plan — the caller writes it back in the same statement that
 * moves the indexed deadline, so the two cannot disagree.
 */
export function snooze(
  plan: BreakPlanItem[],
  ruleId: string,
  opts: { snoozeMin: number; maxSnoozes?: number | null; now?: Date },
): BreakPlanItem[] {
  const now = opts.now ?? new Date();
  const cap = opts.maxSnoozes ?? MAX_SNOOZES_DEFAULT;
  const gap = Math.max(MIN_SNOOZE_MINUTES, Math.round(opts.snoozeMin || 0));
  return plan.map((i) => {
    if (i.ruleId !== ruleId || (i.state !== 'PENDING' && i.state !== 'SNOOZED')) return i;
    const snoozeCount = i.snoozeCount + 1;
    if (snoozeCount > cap) return { ...i, state: 'MISSED' as const, snoozeCount };
    return {
      ...i,
      state: 'SNOOZED' as const,
      snoozeCount,
      dueAt: new Date(now.getTime() + gap * 60_000).toISOString(),
    };
  });
}

/** The member started this rest. */
export function markTaken(
  plan: BreakPlanItem[],
  ruleId: string,
  breakId: string,
  now: Date = new Date(),
): BreakPlanItem[] {
  return plan.map((i) =>
    i.ruleId === ruleId && i.state !== 'TAKEN'
      ? { ...i, state: 'TAKEN' as const, breakId, takenAt: now.toISOString() }
      : i,
  );
}

/** The window closed, or the shift ended, without it being taken. */
export function markMissed(plan: BreakPlanItem[], ruleId: string): BreakPlanItem[] {
  return plan.map((i) =>
    i.ruleId === ruleId && (i.state === 'PENDING' || i.state === 'SNOOZED') ? { ...i, state: 'MISSED' as const } : i,
  );
}

/**
 * A required rest that never happened. Read at clock-out to flag the entry —
 * and deliberately NOT to deduct anything: a rest the member did not take is
 * time they were working, and inventing a deduction is how a time system loses
 * everyone's trust in a week.
 */
export function missedRequired(plan: BreakPlanItem[]): BreakPlanItem[] {
  return plan.filter((i) => i.required && (i.state === 'MISSED' || i.state === 'PENDING' || i.state === 'SNOOZED'));
}

/** The review flag a required rest not taken puts on the entry. Never a deduction. */
export const MISSED_REST_FLAG = ATTENDANCE_FLAG_REASONS.MISSED_BREAK;

/**
 * The required rests this shift has missed.
 *
 * Mid-shift (no `closedAt`) only those already recorded MISSED — the window
 * closed, or "Later" ran out. At the close (`closedAt` = the clock-out) also
 * every required rest still outstanding that had fallen due by then: it can no
 * longer be taken. One that was not yet due when the member left is not missed —
 * they did not work long enough for it.
 */
export function requiredRestsMissed(plan: BreakPlanItem[], closedAt?: Date | null): BreakPlanItem[] {
  return plan.filter((i) => {
    if (!i.required) return false;
    if (i.state === 'MISSED') return true;
    if (!closedAt || (i.state !== 'PENDING' && i.state !== 'SNOOZED')) return false;
    return new Date(i.dueAt).getTime() <= closedAt.getTime();
  });
}

/**
 * `flags` with the missed-rest flag added when the plan has missed a required
 * rest (see `requiredRestsMissed`), deduplicated; unchanged otherwise.
 *
 * ⚠️ Adds, never removes: whether a person has already looked is the approval's
 * business, not this function's. Every path that marks a rest missed — the
 * sweep, "Later", the close — calls this, so the flag means one thing.
 */
export function flagsWithMissedRest(
  flags: readonly string[] | null | undefined,
  plan: BreakPlanItem[],
  closedAt?: Date | null,
  /** What was really taken, for a NEW entry (label rules) — a rest too short counts as missed (B7). */
  taken?: { minutes: number; toleranceMin: number },
): string[] {
  const list = [...(flags ?? [])];
  if (list.includes(MISSED_REST_FLAG)) return list;
  const short = !!taken && requiredRestShort(plan, closedAt, taken.minutes, taken.toleranceMin);
  if (requiredRestsMissed(plan, closedAt).length === 0 && !short) return list;
  return [...list, MISSED_REST_FLAG];
}

/**
 * Were the required rests due by the close really TAKEN, in minutes (clock review B7)? A planned rest is marked
 * taken when it STARTS, so a one-minute "lunch" used to satisfy a required thirty. Short beyond the shift's
 * tolerance → missed: flagged for a person, never deducted. The office adding the rest clears it again.
 */
export function requiredRestShort(
  plan: BreakPlanItem[],
  closedAt: Date | null | undefined,
  takenMinutes: number,
  toleranceMin = 0,
): boolean {
  if (!closedAt) return false;
  const due = plan.filter((i) => i.required && i.state !== 'MISSED' && new Date(i.dueAt) <= closedAt);
  const required = due.reduce((sum, i) => sum + (i.durationMinutes ?? 0), 0);
  return required > 0 && takenMinutes + toleranceMin < required;
}

/** Safe read of whatever the JSON column holds — a bad shape is no plan. */
export function parseBreakPlan(raw: unknown): BreakPlanItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (i): i is BreakPlanItem =>
      !!i &&
      typeof i === 'object' &&
      typeof (i as BreakPlanItem).ruleId === 'string' &&
      typeof (i as BreakPlanItem).dueAt === 'string',
  );
}

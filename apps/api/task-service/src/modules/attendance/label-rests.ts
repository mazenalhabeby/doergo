import { Prisma } from '@prisma/client';
import {
  SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
  judgedByLabelRules,
  lateFromRest,
  readLabelFacts,
  restFlags,
} from '@hbcfield/shared';
import { approvalFor } from './attendance-occurrence';

const MISSED = 'MISSED_BREAK';

/**
 * After the office adds a rest to a NEW entry: is the “Missed rest” still true?
 * It is gone once the rests recorded add up to the required rests planned at
 * clock-in. Returns the columns to write — none for an old entry, or when
 * nothing changes. A status a person decided is left to the caller's own rule.
 */
export function missedRestColumnsAfterOfficeRest(
  entry: {
    labelRules?: number | null;
    flagReasons?: string[] | null;
    breakPlan?: Prisma.JsonValue | null;
    approvalStatus?: string | null;
  },
  rests: ReadonlyArray<{ durationMinutes?: number | null }>,
): { flagReasons?: string[]; approvalStatus?: 'AUTO' | 'PENDING' } {
  const flags = entry.flagReasons ?? [];
  if (!judgedByLabelRules(entry) || !flags.includes(MISSED)) return {};
  const plan = Array.isArray(entry.breakPlan)
    ? (entry.breakPlan as Array<{ required?: boolean; durationMinutes?: number }>)
    : [];
  const required = plan.filter((i) => i.required).reduce((sum, i) => sum + (i.durationMinutes ?? 0), 0);
  const taken = rests.reduce((sum, r) => sum + (r.durationMinutes ?? 0), 0);
  if (required <= 0 || taken < required) return {};
  const next = flags.filter((f) => f !== MISSED);
  const undecided = entry.approvalStatus === 'PENDING' || entry.approvalStatus === 'AUTO';
  return { flagReasons: next, ...(undecided ? { approvalStatus: approvalFor(next) } : {}) };
}

/**
 * When a NEW entry's rest ends (the Break button): longer than its planned length
 * + the shift's grace → LATE_FROM_REST, with the real length in the facts. The
 * planned length is the rest planned nearest to when this one started. Returns
 * nothing for an old entry or a rest with no plan.
 */
export function restColumnsAtBreakEnd(
  entry: {
    labelRules?: number | null;
    labelFacts?: Prisma.JsonValue | null;
    flagReasons?: string[] | null;
    breakPlan?: Prisma.JsonValue | null;
  },
  rest: { startedAt: Date; endedAt: Date },
): { flagReasons?: string[]; labelFacts?: Prisma.InputJsonValue } {
  if (!judgedByLabelRules(entry)) return {};
  const facts = readLabelFacts(entry.labelFacts);
  if (!facts) return {};
  const plan = Array.isArray(entry.breakPlan)
    ? (entry.breakPlan as Array<{ dueAt?: string; durationMinutes?: number }>)
    : [];
  const nearest = plan
    .filter((i) => (i.durationMinutes ?? 0) > 0 && i.dueAt)
    .sort(
      (a, b) =>
        Math.abs(Date.parse(a.dueAt!) - rest.startedAt.getTime()) -
        Math.abs(Date.parse(b.dueAt!) - rest.startedAt.getTime()),
    )[0];
  const judged = lateFromRest({
    plannedMin: nearest?.durationMinutes ?? 0,
    startedAt: rest.startedAt,
    endedAt: rest.endedAt,
    toleranceMin: facts.shift?.toleranceMin ?? SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
  });
  if (!judged) return {};
  // The facts keep the WORST rest of the shift: a later short break must not replace an overrun the
  // label already stands on (the nightly label check found exactly that — a 1-second break wiping it).
  const kept = facts.rest && facts.rest.overMin >= judged.overMin ? facts.rest : judged;
  const flags = entry.flagReasons ?? [];
  return {
    labelFacts: { ...facts, rest: kept } as unknown as Prisma.InputJsonValue,
    ...(restFlags(judged).length && !flags.includes('LATE_FROM_REST')
      ? { flagReasons: [...flags, 'LATE_FROM_REST'] }
      : {}),
  };
}

import { Prisma } from '@prisma/client';
import {
  SCHEDULE_TIME_FLAGS,
  arrivalFlags,
  computeScheduleFlags,
  flagsAgainstDailyLimit,
  judgedByLabelRules,
  lateFromRest,
  readLabelFacts,
  restFlags,
  withClosing,
  type LabelFacts,
} from '@hbcfield/shared';

/**
 * The time labels after an office edit of the times.
 *
 * - An OLD entry (no labelRules) is recomputed exactly as before: the shared
 *   schedule flags against its stored expectation, a daily allowance read as an
 *   allowance.
 * - A NEW entry is judged by the label rules against its own frozen facts: the
 *   shift and grace it was matched to, whether it was the first of the shift
 *   (only the first can be late), and its rest — so an edit never invents a
 *   “late” on a return from lunch, and never drops one whose reason is still there.
 */
export function editTimeFlags(input: {
  entry: {
    labelRules?: number | null;
    labelFacts?: Prisma.JsonValue | null;
    clockInAt: Date;
    expectedClockOutAt?: Date | null;
    endIsDailyLimit: boolean;
  };
  flags: string[];
  expectation: { expectedStart: Date | null; toleranceMin: number | undefined };
  newClockIn: Date;
  newClockOut: Date | null;
}): { flags: string[]; toleranceMin: number | undefined; labelFacts?: LabelFacts } {
  const { entry, expectation, newClockIn, newClockOut } = input;
  const kept = input.flags.filter((f) => !SCHEDULE_TIME_FLAGS.has(f) && f !== 'LATE_FROM_REST');
  const facts = judgedByLabelRules(entry) ? readLabelFacts(entry.labelFacts) : null;

  if (!facts) {
    const recomputed = flagsAgainstDailyLimit(
      computeScheduleFlags({
        clockInAt: newClockIn,
        clockOutAt: newClockOut,
        expectedClockInAt: expectation.expectedStart,
        expectedClockOutAt: entry.expectedClockOutAt ?? null,
        toleranceMin: expectation.toleranceMin,
      }),
      entry.endIsDailyLimit,
    );
    // Old entries keep LATE_FROM_REST out of the picture entirely: they never carried it.
    return {
      flags: [...input.flags.filter((f) => !SCHEDULE_TIME_FLAGS.has(f)), ...recomputed],
      toleranceMin: expectation.toleranceMin,
    };
  }

  const tol = facts.shift?.toleranceMin ?? expectation.toleranceMin ?? 0;
  const expectedStart = facts.shift ? new Date(facts.shift.expectedStartAt) : null;
  const arrival = arrivalFlags({
    firstOfShift: facts.firstOfShift,
    clockInAt: newClockIn,
    expectedClockInAt: expectedStart,
    toleranceMin: tol,
  });
  const departure = flagsAgainstDailyLimit(
    computeScheduleFlags({
      clockOutAt: newClockOut,
      expectedClockOutAt: entry.expectedClockOutAt ?? null,
      toleranceMin: tol,
    }),
    entry.endIsDailyLimit,
  );
  // The rest is re-judged from when they left (unchanged) to the corrected return.
  let rest = facts.rest;
  if (rest) {
    const leftAt = new Date(entry.clockInAt.getTime() - rest.takenMin * 60_000);
    rest =
      lateFromRest({ plannedMin: rest.plannedMin, startedAt: leftAt, endedAt: newClockIn, toleranceMin: tol }) ??
      undefined;
  }
  const nextFacts: LabelFacts = { ...facts, ...(rest ? { rest } : {}) };
  return {
    flags: [...kept, ...arrival, ...departure, ...restFlags(rest ?? null)],
    toleranceMin: tol,
    labelFacts: nextFacts,
  };
}

/** The facts after the office closed an open new entry. */
export function officeCloseFacts(facts: LabelFacts | null | undefined): LabelFacts | undefined {
  return facts ? withClosing(facts, { closedHow: 'OFFICE' }) : undefined;
}

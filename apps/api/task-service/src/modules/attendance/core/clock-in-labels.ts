import {
  arrivalFlags,
  judgePosition,
  labelColumns,
  lateFromRest,
  plannedRestMinutes,
  restFlags,
  shiftFact,
  type LabelFacts,
  type SiteZone,
} from '@hbcfield/shared';
import type { PrismaService } from '@hbcfield/shared';
import type { FragmentCandidate } from './clock-in-join';

/**
 * The time labels and the facts of a NEW clock-in, under the label rules
 * (docs/plans/clock-attendance-2026-10.md). Every clock-in is a new entry, so
 * these always apply; old entries are never passed through here.
 */

/** The earlier, closed entry of the same shift instance today, if any — one narrow query. */
export async function priorEntryOfShift(
  prisma: Pick<PrismaService, 'timeEntry'>,
  input: { userId: string; locationId: string; expectedClockInAt: Date | null | undefined; before: Date },
): Promise<FragmentCandidate | null> {
  if (!input.expectedClockInAt) return null;
  const row = await prisma.timeEntry.findFirst({
    where: {
      userId: input.userId,
      locationId: input.locationId,
      expectedClockInAt: input.expectedClockInAt,
      clockInAt: { lt: input.before },
      clockOutAt: { not: null, lte: input.before },
    },
    orderBy: { clockOutAt: 'desc' },
    select: {
      id: true,
      clockInAt: true,
      clockOutAt: true,
      flagReasons: true,
      labelRules: true,
      labelFacts: true,
      breakPlan: true,
    },
  });
  return row?.clockOutAt ? ({ ...row, clockOutAt: row.clockOutAt } as FragmentCandidate) : null;
}

export interface ClockInLabelInput {
  /** A shift (or an agreed start) applies today. */
  planned: boolean;
  clockInAt: Date;
  stamp: { shiftId?: string; expectedClockInAt?: Date; expectedClockOutAt?: Date };
  shiftName: string | null;
  toleranceMin: number;
  endIsDailyLimit: boolean;
  prior: { clockOutAt: Date; breakPlan: unknown } | null;
  fix: { lat: number; lng: number; accuracy?: number | null };
  zone: SiteZone;
}

/**
 * LATE_ARRIVAL only for the first entry of a shift; coming back after a planned
 * rest is judged as a rest (LATE_FROM_REST). Returns the time flags and the
 * columns to write with the entry.
 */
export function clockInLabels(input: ClockInLabelInput): {
  flags: string[];
  columns: ReturnType<typeof labelColumns>;
} {
  const firstOfShift = !input.prior;
  const flags: string[] = [];
  let rest: LabelFacts['rest'];
  if (input.planned) {
    flags.push(
      ...arrivalFlags({
        firstOfShift,
        clockInAt: input.clockInAt,
        expectedClockInAt: input.stamp.expectedClockInAt,
        toleranceMin: input.toleranceMin,
      }),
    );
    if (input.prior) {
      const judged = lateFromRest({
        plannedMin: plannedRestMinutes(input.prior.breakPlan as never),
        startedAt: input.prior.clockOutAt,
        endedAt: input.clockInAt,
        toleranceMin: input.toleranceMin,
      });
      if (judged) rest = judged;
      flags.push(...restFlags(judged));
    }
  }
  const facts: LabelFacts = {
    shift: input.planned
      ? shiftFact({
          shiftId: input.stamp.shiftId,
          shiftName: input.shiftName,
          expectedClockInAt: input.stamp.expectedClockInAt,
          expectedClockOutAt: input.stamp.expectedClockOutAt,
          toleranceMin: input.toleranceMin,
          endIsDailyLimit: input.endIsDailyLimit,
        })
      : null,
    firstOfShift,
    ...(rest ? { rest } : {}),
    clockIn: judgePosition(input.fix, input.zone).fact,
  };
  return { flags, columns: labelColumns(facts) };
}

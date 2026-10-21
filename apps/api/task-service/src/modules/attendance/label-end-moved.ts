import { Prisma } from '@prisma/client';
import {
  computeScheduleFlags,
  flagsAgainstDailyLimit,
  judgedByLabelRules,
  readLabelFacts,
  withExpectedEnd,
} from '@hbcfield/shared';
import type { PrismaService } from '@hbcfield/shared';
import { approvalFor } from './attendance-occurrence';

const DEPARTURE_FLAGS = new Set(['EARLY_DEPARTURE', 'OVERTIME', 'PAST_DAILY_LIMIT']);

/** The departure labels of a closed entry against a (moved) planned end — pure. */
export function departureFlagsAfterEndMoved(input: {
  flags: string[];
  clockOutAt: Date | null;
  expectedClockOutAt: Date | null;
  toleranceMin: number;
  endIsDailyLimit: boolean;
}): string[] {
  if (!input.clockOutAt) return input.flags;
  const departure = flagsAgainstDailyLimit(
    computeScheduleFlags({
      clockOutAt: input.clockOutAt,
      expectedClockOutAt: input.expectedClockOutAt,
      toleranceMin: input.toleranceMin,
    }),
    input.endIsDailyLimit,
  );
  return [...new Set([...input.flags.filter((f) => !DEPARTURE_FLAGS.has(f)), ...departure])];
}

/**
 * After approved extra time (or its removal) moved a NEW entry's planned end:
 * the facts record the new end and, once closed, its departure labels are
 * judged again — approved overtime is no longer “Overtime”, and the status
 * follows unless a person decided. Old entries: nothing (the past is not touched).
 */
export async function relabelAfterEndMoved(
  prisma: Pick<PrismaService, 'timeEntry'>,
  entry: {
    id: string;
    labelRules?: number | null;
    labelFacts?: Prisma.JsonValue | null;
    clockOutAt?: Date | null;
    flagReasons?: string[] | null;
    endIsDailyLimit?: boolean;
    approvalStatus?: string | null;
  },
  expectedClockOutAt: Date | null,
): Promise<void> {
  // The entry was already read by the caller: no second query, and none at all for an old entry.
  if (!judgedByLabelRules(entry)) return;
  const facts = readLabelFacts(entry.labelFacts);
  if (!facts) return;
  const clockOutAt = entry.clockOutAt ?? null;
  const flags = departureFlagsAfterEndMoved({
    flags: entry.flagReasons ?? [],
    clockOutAt,
    expectedClockOutAt,
    toleranceMin: facts.shift?.toleranceMin ?? 0,
    endIsDailyLimit: entry.endIsDailyLimit ?? false,
  });
  const undecided = entry.approvalStatus === 'PENDING' || entry.approvalStatus === 'AUTO';
  await prisma.timeEntry.update({
    where: { id: entry.id },
    data: {
      labelFacts: withExpectedEnd(facts, expectedClockOutAt) as unknown as Prisma.InputJsonValue,
      ...(clockOutAt ? { flagReasons: flags } : {}),
      ...(clockOutAt && undecided ? { approvalStatus: approvalFor(flags) } : {}),
    },
  });
}

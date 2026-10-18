import { Prisma } from '@prisma/client';
import {
  arrivalFlags,
  computeScheduleFlags,
  judgedByLabelRules,
  lateFromRest,
  plannedRestMinutes,
  readLabelFacts,
  restFlags,
  shiftFact,
  zoneOf,
} from '@hbcfield/shared';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { approvedRequestsAround, dayRequestEffect } from './approved-requests';
import { priorEntryOfShift } from './clock-in-labels';

/**
 * A NEW entry matched to a shift after the rota changed, judged like a clock-in:
 * the day's approved requests move the start/end first (agreed hours used to be
 * ignored here), only the first entry of the shift can be late, a return after a
 * planned rest is judged as the rest. Returns null for an old entry — the caller
 * keeps today's path for it.
 */
export async function rematchLabels(
  prisma: Pick<PrismaService, 'timeEntry' | 'timeOff'>,
  entry: {
    id: string;
    userId: string;
    locationId: string;
    clockInAt: Date;
    clockOutAt: Date | null;
    timezone: string | null;
    labelRules: number | null;
    labelFacts: Prisma.JsonValue | null;
    location: { timezone: string | null };
  },
  resolved: {
    shiftId: string | null;
    shiftName?: string | null;
    expectedClockInAt: Date;
    expectedClockOutAt: Date;
    flagToleranceMin: number;
  },
): Promise<{
  expectedClockInAt: Date;
  expectedClockOutAt: Date;
  flags: string[];
  labelFacts: Prisma.InputJsonValue;
} | null> {
  if (!judgedByLabelRules(entry)) return null;
  const facts = readLabelFacts(entry.labelFacts);
  if (!facts) return null;
  const tz = zoneOf(entry.timezone, entry.location.timezone);
  const effect = dayRequestEffect(await approvedRequestsAround(prisma, entry.userId, entry.clockInAt), {
    spaceId: entry.locationId,
    at: entry.clockInAt,
    tz,
    expectedClockInAt: resolved.expectedClockInAt,
    expectedClockOutAt: resolved.expectedClockOutAt,
  });
  const start = effect.expectedClockInAt ?? resolved.expectedClockInAt;
  const end = effect.expectedClockOutAt ?? resolved.expectedClockOutAt;
  const tol = resolved.flagToleranceMin;
  const prior = await priorEntryOfShift(prisma, {
    userId: entry.userId,
    locationId: entry.locationId,
    expectedClockInAt: start,
    before: entry.clockInAt,
  });
  const rest = prior
    ? lateFromRest({
        plannedMin: plannedRestMinutes(prior.breakPlan as never),
        startedAt: prior.clockOutAt,
        endedAt: entry.clockInAt,
        toleranceMin: tol,
      })
    : null;
  const flags = [
    ...arrivalFlags({ firstOfShift: !prior, clockInAt: entry.clockInAt, expectedClockInAt: start, toleranceMin: tol }),
    ...computeScheduleFlags({ clockOutAt: entry.clockOutAt, expectedClockOutAt: end, toleranceMin: tol }),
    ...restFlags(rest),
  ];
  const next = {
    ...facts,
    shift: shiftFact({
      shiftId: resolved.shiftId,
      shiftName: resolved.shiftName ?? null,
      expectedClockInAt: start,
      expectedClockOutAt: end,
      toleranceMin: tol,
      endIsDailyLimit: false,
    }),
    firstOfShift: !prior,
    ...(rest ? { rest } : {}),
  };
  return {
    expectedClockInAt: start,
    expectedClockOutAt: end,
    flags,
    labelFacts: next as unknown as Prisma.InputJsonValue,
  };
}

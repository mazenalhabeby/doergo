import { Prisma } from '@prisma/client';
import { nextBreakRemindAt, parseBreakPlan, readLabelFacts, TimeEntryStatus } from '@hbcfield/shared';
import type { PrismaService } from '@hbcfield/shared';
import { approvalFor } from './attendance-occurrence';

/**
 * One entry per shift (label rules, new entries only).
 *
 * Offline, an automatic clock-in and the member's own tap can reach the server
 * together; the phone then filed a departure in between, and the server made an
 * 11-second entry labelled “Left early” plus a second, real one. When a clock-in
 * arrives for the same shift instance right after such a fragment, it JOINS the
 * fragment — reopened, keeping its earlier arrival — instead of opening another.
 */
export const FRAGMENT_MAX_MS = 2 * 60_000;
/** The clock-in must follow the fragment's close this closely to be the same arrival. */
export const JOIN_WITHIN_MS = 2 * 60_000;

export interface FragmentCandidate {
  id: string;
  clockInAt: Date;
  clockOutAt: Date;
  flagReasons: string[];
  labelRules: number | null;
  labelFacts: Prisma.JsonValue | null;
  breakPlan: Prisma.JsonValue | null;
}

/** Is the earlier entry of the shift a fragment this clock-in should join? Pure. */
export function isJoinableFragment(prior: FragmentCandidate | null, clockInAt: Date): prior is FragmentCandidate {
  if (!prior || prior.labelRules == null) return false;
  const flags = prior.flagReasons ?? [];
  if (!flags.includes('AUTO_CLOCK_IN') || flags.includes('AUTO_CLOCK_OUT')) return false;
  // Only a departure the PHONE filed; the person's own clock-out is a real one.
  if (!readLabelFacts(prior.labelFacts)?.departureByPhone) return false;
  const length = prior.clockOutAt.getTime() - prior.clockInAt.getTime();
  const gap = clockInAt.getTime() - prior.clockOutAt.getTime();
  return length >= 0 && length < FRAGMENT_MAX_MS && gap >= 0 && gap <= JOIN_WITHIN_MS;
}

const CLOSE_ONLY_FLAGS = new Set(['EARLY_DEPARTURE', 'OVERTIME', 'PAST_DAILY_LIMIT', 'OUTSIDE_GEOFENCE_OUT']);

/**
 * Reopen the fragment for this clock-in. Claimed with a conditional update (the
 * fragment must still be the closed row we read), so two clock-ins racing cannot
 * both reopen it. Returns the reopened row, or null when the claim lost (the
 * caller then records the clock-in as a new entry, as before).
 */
export async function joinFragment(
  prisma: Pick<PrismaService, 'timeEntry'>,
  fragment: FragmentCandidate,
  join: { clockInId: string | undefined; nextRemindAt: Date | null | undefined; now: Date },
) {
  const flags = fragment.flagReasons.filter((f) => !CLOSE_ONLY_FLAGS.has(f));
  const facts = readLabelFacts(fragment.labelFacts);
  const plan = parseBreakPlan(fragment.breakPlan);
  const reopenedFacts = facts
    ? {
        ...facts,
        closedHow: undefined,
        clockOut: undefined,
        departureByPhone: undefined,
        joinedClockInIds: [...(facts.joinedClockInIds ?? []), ...(join.clockInId ? [join.clockInId] : [])],
      }
    : undefined;
  const claim = await prisma.timeEntry.updateMany({
    where: { id: fragment.id, status: TimeEntryStatus.CLOCKED_OUT, clockOutAt: fragment.clockOutAt },
    data: {
      status: TimeEntryStatus.CLOCKED_IN,
      clockOutAt: null,
      clockOutLat: null,
      clockOutLng: null,
      clockOutAccuracy: null,
      clockOutWithinGeofence: null,
      totalMinutes: null,
      countedStartAt: null,
      countedEndAt: null,
      paidMinutes: null,
      flagReasons: flags,
      approvalStatus: approvalFor(flags),
      reminderState: 'NONE',
      reminderCount: 0,
      nextRemindAt: join.nextRemindAt ?? null,
      nextBreakRemindAt: plan.length ? nextBreakRemindAt(plan, join.now) : null,
      ...(reopenedFacts ? { labelFacts: JSON.parse(JSON.stringify(reopenedFacts)) as Prisma.InputJsonValue } : {}),
    },
  });
  if (claim.count === 0) return null;
  return prisma.timeEntry.findUnique({ where: { id: fragment.id }, include: { location: true } });
}

/** The entry a clock-in (by its phone-made id) was joined into, looked up within two days. */
export function joinedIntoWhere(clockInId: string): Prisma.TimeEntryWhereInput {
  return {
    clockInAt: { gte: new Date(Date.now() - 2 * 86_400_000) },
    labelFacts: { path: ['joinedClockInIds'], array_contains: [clockInId] },
  };
}

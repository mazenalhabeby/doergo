import { COUNTED_ROUND_STATUSES, overtimeRuleFacts, type PrismaService } from '@hbcfield/shared';
import type { RuleGateInput } from '../../approvals/rules/rule-gate-types';
import { missedWrite } from '../../approvals/rules/conditional-write';

/* What an overtime rule needs from the database; the pure builder is shared (`overtimeRuleFacts`). */

/**
 * Overtime already approved on each of these shifts: every approved round, and time outside the shift counted
 * BEFORE the planned start (the part after the end is a round already). Two queries, however many shifts.
 */
export async function approvedOvertimeByEntry(prisma: PrismaService, entryIds: string[]): Promise<Map<string, number>> {
  if (!entryIds.length) return new Map();
  const [rounds, before] = await Promise.all([
    prisma.overtimeRequest.groupBy({
      by: ['timeEntryId'],
      // COMPLETED: the older flow's word for an approved round that ran its course — still approved overtime.
      where: { timeEntryId: { in: entryIds }, status: { in: [...COUNTED_ROUND_STATUSES] } },
      _sum: { maxDurationMinutes: true },
    }),
    prisma.timeEntry.findMany({
      where: { id: { in: entryIds }, outsideBeforeMinutes: { gt: 0 } },
      select: { id: true, outsideBeforeMinutes: true },
    }),
  ]);
  const out = new Map(rounds.map((r) => [r.timeEntryId as string, r._sum.maxDurationMinutes ?? 0]));
  for (const e of before) out.set(e.id, (out.get(e.id) ?? 0) + (e.outsideBeforeMinutes ?? 0));
  return out;
}

/** The number of the last overtime round on a shift (0 = none) — the next round written is numbered after it. */
export async function lastRoundCycle(prisma: PrismaService, entryId: string): Promise<number> {
  const last = await prisma.overtimeRequest.findFirst({
    where: { timeEntryId: entryId },
    orderBy: { cycle: 'desc' },
    select: { cycle: true },
  });
  return last?.cycle ?? 0;
}

/**
 * An overtime write that missed its claim: decided meanwhile → `OVERTIME_ALREADY_DECIDED` (the round refused or
 * approved by somebody else, a NEWER round written by somebody else — two adding at once — or the shift gone);
 * only CHANGED (another path moved the end) → `CHANGED_MEANWHILE`. Either way the approvals end.
 *   { roundId } — deciding a round that waits: still waiting = that round is still PENDING_APPROVAL;
 *   { afterCycle } — adding a round: still waiting = the shift exists and nobody wrote a round after `afterCycle`.
 */
export function overtimeWriteMissed(
  prisma: PrismaService,
  entryId: string,
  seen: { roundId: string } | { afterCycle: number },
) {
  const roundStillWaiting = async (roundId: string) =>
    (await prisma.overtimeRequest.count({ where: { id: roundId, status: 'PENDING_APPROVAL' } })) > 0;
  const noNewerRound = async (afterCycle: number) =>
    (await prisma.timeEntry.count({ where: { id: entryId } })) > 0 &&
    (await prisma.overtimeRequest.count({ where: { timeEntryId: entryId, cycle: { gt: afterCycle } } })) === 0;
  return missedWrite(
    () => ('roundId' in seen ? roundStillWaiting(seen.roundId) : noNewerRound(seen.afterCycle)),
    'OVERTIME_ALREADY_DECIDED',
    'This overtime was decided a moment ago.',
  );
}

/**
 * An overtime decision as the office rules judge it — ONE shape for approving a round, adding to a closed shift and
 * counting time outside it: the shift's WHOLE overtime (earlier approved rounds + this one), while this decision
 * agrees to its own minutes (59-minute rounds are no way round a one-hour rule).
 */
export function overtimeGateInput(
  entry: { id: string; locationId: string | null; userId: string },
  minutes: number,
  approvedBefore: number,
  decider: { organizationId: string; approverId: string },
  itemId: string = entry.id,
): RuleGateInput {
  return {
    organizationId: decider.organizationId,
    kind: 'overtime',
    itemId,
    facts: overtimeRuleFacts(entry.locationId, minutes, approvedBefore),
    agreeMinutes: minutes,
    deciderId: decider.approverId,
    subjectId: entry.userId,
  };
}

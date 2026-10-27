import type { PrismaService } from '@hbcfield/shared';
import { missedWrite } from '../../approvals/rules/already-decided';

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
      where: { timeEntryId: { in: entryIds }, status: { in: ['APPROVED', 'COMPLETED'] } },
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
 * An overtime write that missed its claim (the end it read, or the round still waiting): decided meanwhile — the
 * round refused or approved by somebody else, the shift gone — or only CHANGED (another path moved the end).
 */
export function overtimeWriteMissed(prisma: PrismaService, entryId: string, roundId?: string) {
  return missedWrite(
    async () =>
      roundId
        ? (await prisma.overtimeRequest.count({ where: { id: roundId, status: 'PENDING_APPROVAL' } })) > 0
        : (await prisma.timeEntry.count({ where: { id: entryId } })) > 0,
    'OVERTIME_ALREADY_DECIDED',
    'This overtime was decided a moment ago.',
  );
}

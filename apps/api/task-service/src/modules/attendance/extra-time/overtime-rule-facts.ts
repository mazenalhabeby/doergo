import type { PrismaService } from '@hbcfield/shared';

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

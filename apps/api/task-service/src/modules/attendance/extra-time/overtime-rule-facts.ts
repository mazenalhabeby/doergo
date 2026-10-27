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
      where: { timeEntryId: { in: entryIds }, status: 'APPROVED' },
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

/**
 * Approvals half-way under an office rule for a round of this shift that has LAPSED since (expired, declined) are
 * not about a new decision on the same shift — they end (their step is keyed by the shift). Returns the last round's
 * number, for a round written next.
 */
export async function closeLapsedOvertimeSteps(
  prisma: PrismaService,
  rules: { clearBefore(organizationId: string, kind: 'overtime', itemId: string, since: Date): Promise<void> },
  organizationId: string,
  entryId: string,
): Promise<number> {
  const last = await prisma.overtimeRequest.findFirst({
    where: { timeEntryId: entryId },
    orderBy: { cycle: 'desc' },
    select: { cycle: true, updatedAt: true },
  });
  if (last) await rules.clearBefore(organizationId, 'overtime', entryId, last.updatedAt);
  return last?.cycle ?? 0;
}

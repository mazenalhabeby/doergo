import { spaceIdsOf, type PrismaService, type RuleFacts } from '@hbcfield/shared';

/**
 * What an office rule on overtime judges: the shift's WHOLE overtime — every round already approved on it plus
 * the one being decided — so 59-minute rounds, or overtime split between a round and time outside the shift,
 * are no way round a one-hour rule. ONE builder for the approve paths, time outside the shift, the reminder
 * sweep and the rules page's numbers (`rule-facts.reader.ts`).
 */
export function overtimeRuleFacts(spaceId: string | null, minutes: number, approvedBefore: number): RuleFacts {
  return { spaceIds: spaceIdsOf(spaceId), minutes: minutes + approvedBefore };
}

/** Overtime already approved on each of these shifts (every round), in one query. */
export async function approvedOvertimeByEntry(prisma: PrismaService, entryIds: string[]): Promise<Map<string, number>> {
  if (!entryIds.length) return new Map();
  const rows = await prisma.overtimeRequest.groupBy({
    by: ['timeEntryId'],
    where: { timeEntryId: { in: entryIds }, status: 'APPROVED' },
    _sum: { maxDurationMinutes: true },
  });
  return new Map(rows.map((r) => [r.timeEntryId as string, r._sum.maxDurationMinutes ?? 0]));
}

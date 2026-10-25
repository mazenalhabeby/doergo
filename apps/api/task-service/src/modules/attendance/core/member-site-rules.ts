import { effectiveClockRules, notEndedWhere, type PrismaService, type WorkspaceClockColumns } from '@hbcfield/shared';

/**
 * A workspace as ONE member clocks there (clock review D1) — for the paths that start from a time entry rather
 * than from the clock-in (heartbeats, clock-out, the close). The clock-in already reads the assignment; here it
 * is one indexed query, and a member without their own rules gets the workspace back unchanged.
 */
export async function memberSiteRules<T extends WorkspaceClockColumns>(
  prisma: PrismaService,
  userId: string,
  spaceId: string | null | undefined,
  site: T,
): Promise<T> {
  if (!spaceId) return site;
  const own = await prisma.spaceAssignment.findFirst({
    where: { userId, spaceId, ...notEndedWhere() },
    select: { workAs: true, workDailyMinutes: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!own || (own.workAs == null && own.workDailyMinutes == null)) return site;
  return { ...site, ...effectiveClockRules(site, own) };
}

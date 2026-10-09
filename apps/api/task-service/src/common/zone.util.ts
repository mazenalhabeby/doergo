import type { PrismaService } from './prisma/prisma.service';

/**
 * Which time zone "today" is read in for something that belongs to a workspace
 * — the workspace's, else the organization's, else UTC. The order the rest of
 * the service already follows (leader-absent, attendance's no-show sweep).
 *
 * ⚠️ Never the server's. The containers run in UTC, so `setHours(0,0,0,0)` was
 * midnight in London for an organization in New York or Vienna: "today" began
 * at 01:00 or 19:00 local, and a template starting today could be refused as
 * "in the past" in the evening.
 *
 * Day arithmetic itself is the shared zoned-time helpers (`startOfDayIn`,
 * `endOfDayIn`, `localPartsIn`, `zonedWallTimeToUtc`) — this only picks the zone.
 */
export async function workspaceZone(
  prisma: Pick<PrismaService, 'companyLocation' | 'organization'>,
  where: { spaceId?: string | null; organizationId: string },
): Promise<string> {
  if (where.spaceId) {
    const space = await prisma.companyLocation.findFirst({
      where: { id: where.spaceId, organizationId: where.organizationId },
      select: { timezone: true },
    });
    if (space?.timezone) return space.timezone;
  }
  const org = await prisma.organization.findUnique({
    where: { id: where.organizationId },
    select: { timezone: true },
  });
  return org?.timezone || 'UTC';
}

/**
 * Which time zone "today" is read in for something that belongs to a workspace
 * — the workspace's, else the organization's, else UTC.
 *
 * ⚠️ Never the server's. The containers run in UTC, so `setHours(0,0,0,0)` was
 * midnight in London for an organization in New York or Vienna: "today" began at
 * 01:00 or 19:00 local, and an invoice issued at 00:30 was dated the day before.
 *
 * One rule for every service (task-service had it; auth-service's invoices read
 * the UTC day). Day arithmetic itself is the zoned-time helpers — this only
 * picks the zone. Structural `db`: any Prisma client satisfies it.
 */
/**
 * The first zone that is set, else UTC — for a caller that already holds the
 * rows (entry → workspace → organization, in the order given). The ONLY place a
 * missing zone becomes a default: some copies said UTC and some Europe/Berlin,
 * so the same workspace could get two different "todays".
 */
export function zoneOf(...zones: Array<string | null | undefined>): string {
  for (const z of zones) if (z) return z;
  return 'UTC';
}

export interface WorkspaceZoneDb {
  companyLocation: { findFirst(args: any): Promise<{ timezone: string | null } | null> };
  organization: { findUnique(args: any): Promise<{ timezone: string | null } | null> };
}

export async function workspaceZone(
  db: WorkspaceZoneDb,
  where: { spaceId?: string | null; organizationId: string },
): Promise<string> {
  if (where.spaceId) {
    const space = await db.companyLocation.findFirst({
      where: { id: where.spaceId, organizationId: where.organizationId },
      select: { timezone: true },
    });
    if (space?.timezone) return space.timezone;
  }
  const org = await db.organization.findUnique({
    where: { id: where.organizationId },
    select: { timezone: true },
  });
  return zoneOf(org?.timezone);
}

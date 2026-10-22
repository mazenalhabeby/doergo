/**
 * Published reads of auth-service's workspace-sharing table (`SpaceShare`) — see db.ts. Owner: auth-service.
 */
import type { On } from './db';

/** How many organizations a workspace is shared with right now. */
export function activeShareCount(db: On<'spaceShare', 'count'>, spaceId: string) {
  return db.spaceShare.count({ where: { spaceId, status: 'ACTIVE' } });
}

/** Active shares of these workspaces that show workers, where the organization is owner or guest. */
export function workerSharesOf(db: On<'spaceShare', 'findMany'>, organizationId: string, spaceIds: string[]) {
  return db.spaceShare.findMany({
    where: {
      status: 'ACTIVE',
      showWorkers: true,
      spaceId: { in: spaceIds },
      OR: [{ ownerOrgId: organizationId }, { guestOrgId: organizationId }],
    },
    select: { spaceId: true, ownerOrgId: true, guestOrgId: true, expiresAt: true },
  });
}

/** Active worker-showing shares between one organization and any of these others, either way round. */
export function workerSharesBetween(db: On<'spaceShare', 'findMany'>, myOrg: string, others: string[]) {
  return db.spaceShare.findMany({
    where: {
      status: 'ACTIVE',
      showWorkers: true,
      OR: [
        { ownerOrgId: myOrg, guestOrgId: { in: others } },
        { guestOrgId: myOrg, ownerOrgId: { in: others } },
      ],
    },
    select: { spaceId: true, ownerOrgId: true, guestOrgId: true, status: true, showWorkers: true, expiresAt: true },
  });
}

/** The owner of a workspace's active share (null = not shared). */
export function activeShareOwner(db: On<'spaceShare', 'findFirst'>, spaceId: string) {
  return db.spaceShare.findFirst({ where: { spaceId, status: 'ACTIVE' }, select: { ownerOrgId: true } });
}

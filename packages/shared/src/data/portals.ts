/**
 * Published reads of auth-service's client portal tables (`Portal`, `CustomerUnit`) — see db.ts.
 * Owner: auth-service.
 */
import { scopeWhereOn, type SpaceScopeIds } from '../access/space-scope';
import type { On } from './db';

/** A portal of the organization: `{ id, spaceId }` or null. */
export function portalInOrg(db: On<'portal', 'findFirst'>, portalId: string, organizationId: string) {
  return db.portal.findFirst({ where: { id: portalId, organizationId }, select: { id: true, spaceId: true } });
}

/** The organization's active portals in the caller's scope, oldest first (≤ `take`). */
export function activePortals(
  db: On<'portal', 'findMany'>,
  organizationId: string,
  scope: SpaceScopeIds,
  take: number,
) {
  return db.portal.findMany({
    where: { organizationId, isActive: true, ...scopeWhereOn('spaceId', scope) },
    orderBy: { createdAt: 'asc' },
    take,
    select: { id: true, spaceId: true },
  });
}

/** A unit of the organization (for a portal client: one THEY hold and still active) — `{ id }` or null. */
export function unitRef(
  db: On<'customerUnit', 'findFirst'>,
  unitId: string,
  organizationId: string,
  portal?: { customerId: string | null },
) {
  return db.customerUnit.findFirst({
    where: {
      id: unitId,
      organizationId,
      ...(portal ? { customerId: portal.customerId || undefined, isActive: true } : {}),
    },
    select: { id: true },
  });
}

/** A unit's address and name. */
export function unitAddress(db: On<'customerUnit', 'findFirst'>, unitId: string, organizationId: string) {
  return db.customerUnit.findFirst({ where: { id: unitId, organizationId }, select: { address: true, name: true } });
}

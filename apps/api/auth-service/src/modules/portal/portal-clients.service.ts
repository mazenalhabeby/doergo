import { Injectable, NotFoundException } from '@nestjs/common';
import { scopeWhereOn, type SpaceScopeIds } from '@hbcfield/shared';
import { PortalServiceBase } from './portal-service.base';

/** Who a portal can still take, and taking a client out of it. */
@Injectable()
export class PortalClientsService extends PortalServiceBase {
  /** Vacant apartments the office can assign when inviting a client — the
   *  portal's space catalog, minus any already occupied (member or client).
   *  Staff-only (portal-admin); no apartments-module gate. */
  async listAvailableUnitsForPortal(data: { organizationId: string; portalId: string; scopeSpaceIds?: SpaceScopeIds }) {
    const portal = await this.prisma.portal.findFirst({
      where: { id: data.portalId, organizationId: data.organizationId, ...scopeWhereOn('spaceId', data.scopeSpaceIds) },
      select: { id: true, spaceId: true },
    });
    if (!portal) throw new NotFoundException('Portal not found');
    const rows = await this.prisma.customerUnit.findMany({
      where: {
        organizationId: data.organizationId,
        isActive: true,
        residentUserId: null,
        customerId: null,
        // Space apartments carry spaceId; fall back to portal-scoped units.
        ...(portal.spaceId ? { spaceId: portal.spaceId } : { portalId: data.portalId }),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, address: true, lat: true, lng: true },
      take: 200,
    });
    return { data: rows };
  }

  /** Existing CRM customers the office can invite into the portal — the portal's
   *  space customers who aren't portal residents yet. Staff-only (portal-admin). */
  async listAssignableCustomersForPortal(data: { organizationId: string; portalId: string; scopeSpaceIds?: SpaceScopeIds }) {
    const portal = await this.prisma.portal.findFirst({
      where: { id: data.portalId, organizationId: data.organizationId, ...scopeWhereOn('spaceId', data.scopeSpaceIds) },
      select: { id: true, spaceId: true },
    });
    if (!portal) throw new NotFoundException('Portal not found');
    const rows = await this.prisma.customer.findMany({
      where: {
        organizationId: data.organizationId,
        isActive: true,
        isPortalResident: false,
        ...(portal.spaceId ? { spaceId: portal.spaceId } : {}),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
      take: 200,
    });
    return { data: rows };
  }

  /** Remove a CLIENT from a portal (the Clients tab action). Best-performance:
   *  one round-trip to collect the login ids (for cache busting) + one atomic
   *  transaction that revokes app access, detaches from the portal, vacates any
   *  apartment they held, and revokes pending invites. The customer record is
   *  KEPT (isActive), so it's reversible and no history is lost. Returns the
   *  deactivated login ids so the gateway can bust the token cache instantly. */
  async removePortalClient(data: { organizationId: string; customerId: string; scopeSpaceIds?: SpaceScopeIds }) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: data.customerId,
        organizationId: data.organizationId,
        // A resident of a portal in a workspace the caller runs.
        ...(data.scopeSpaceIds === undefined || data.scopeSpaceIds === null
          ? {}
          : { portal: { spaceId: { in: data.scopeSpaceIds } } }),
      },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Client not found');

    const users = await this.prisma.user.findMany({
      where: { customerId: data.customerId, organizationId: data.organizationId },
      select: { id: true },
    });
    const deactivatedUserIds = users.map((u) => u.id);

    await this.prisma.$transaction([
      // Revoke the app login(s).
      this.prisma.user.updateMany({ where: { customerId: data.customerId, organizationId: data.organizationId }, data: { isActive: false } }),
      // Detach from the portal — drops off the Clients list, keeps the record.
      this.prisma.customer.update({ where: { id: data.customerId }, data: { isPortalResident: false, portalId: null } }),
      // Vacate any apartment/unit they occupied.
      this.prisma.customerUnit.updateMany({ where: { customerId: data.customerId, organizationId: data.organizationId }, data: { customerId: null } }),
      // Revoke any still-pending invitation.
      this.prisma.invitation.updateMany({ where: { customerId: data.customerId, status: 'PENDING' }, data: { status: 'REVOKED' } }),
    ]);

    return { data: { success: true, deactivatedUserIds } };
  }
}

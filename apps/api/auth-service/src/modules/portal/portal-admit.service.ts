import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, scopeWhereOn, type SpaceScopeIds } from '@hbcfield/shared';
import { CustomerWriteService } from '../customers/customer-write.service';
import { EXISTING_SELECT } from '../customers/customers-helpers';

/**
 * Admitting a client into a portal — the invite form's first step.
 *
 * ⚠️ Authorised by the PORTAL's manage authority (`canManagePortals`, narrowed to
 * `scopeSpaceIds`), not by the CRM's create rule. The gateway used to call the
 * CRM's own create/update without a caller, and the CRM (correctly) refused a
 * caller it could not name — so every invite failed, the owner's included. A
 * portal manager decides who gets into the portal; creating the client record
 * that login needs is part of that decision, and it is filed in the PORTAL's
 * workspace, never nowhere.
 */
@Injectable()
export class PortalAdmitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: CustomerWriteService,
  ) {}

  async admitResident(data: {
    organizationId: string;
    portalId: string;
    customerId?: string;
    name?: string;
    email?: string;
    actorId?: string;
    scopeSpaceIds?: SpaceScopeIds;
  }) {
    const { organizationId } = data;
    const portal = await this.prisma.portal.findFirst({
      where: { id: data.portalId, organizationId, ...scopeWhereOn('spaceId', data.scopeSpaceIds) },
      select: { id: true, spaceId: true },
    });
    if (!portal) throw new NotFoundException('Portal not found');
    const email = data.email?.trim() || undefined;

    if (!data.customerId) {
      return this.clients.insertClient(organizationId, {
        name: data.name?.trim() || 'Pending client',
        email,
        isPortalResident: true,
        portalId: portal.id,
        spaceId: portal.spaceId ?? undefined,
      });
    }
    // The same set the invite picker offers: a client of the portal's workspace,
    // or already this portal's resident. Anything else answers like a missing id.
    const existing = await this.prisma.customer.findFirst({
      where: {
        id: data.customerId,
        organizationId,
        ...(portal.spaceId ? { OR: [{ portalId: portal.id }, { spaceId: portal.spaceId }] } : {}),
      },
      select: EXISTING_SELECT,
    });
    if (!existing) throw new NotFoundException('Customer not found');
    return this.clients.writeClient(
      existing,
      organizationId,
      { isPortalResident: true, portalId: portal.id, ...(email ? { email } : {}) },
      data.actorId,
    );
  }
}

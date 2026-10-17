import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { type CrmCaller } from '../customers/customers.service';
import { SELECTABLE_ASSET_WHERE, type SpaceScopeIds } from '@hbcfield/shared';
import { PortalServiceBase } from './portal-service.base';

/** Reading addresses (units): one, a client's, a list, their activity, the assets on them. */
@Injectable()
export class PortalUnitsService extends PortalServiceBase {
  async getUnit(data: { id: string; organizationId: string; scopeSpaceIds?: string[] }) {
    const unit = await this.prisma.customerUnit.findFirst({
      where: { id: data.id, organizationId: data.organizationId, ...this.unitScope(data.scopeSpaceIds) },
      include: { customer: { select: { id: true, name: true, email: true, phone: true } } },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    const [enriched] = await this.withResidentUsers([unit]);
    return { data: enriched };
  }

  async listUnitActivities(data: { id: string; organizationId: string; scopeSpaceIds?: string[] }) {
    const unit = await this.prisma.customerUnit.findFirst({ where: { id: data.id, organizationId: data.organizationId, ...this.unitScope(data.scopeSpaceIds) }, select: { id: true } });
    if (!unit) throw new NotFoundException('Unit not found');
    const rows = await this.prisma.unitActivity.findMany({ where: { unitId: data.id }, orderBy: { createdAt: 'desc' }, take: 200 });
    const authorIds = [...new Set(rows.map((r) => r.authorId).filter(Boolean) as string[])];
    const authors = authorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const byId = new Map(authors.map((a) => [a.id, a]));
    return { data: rows.map((r) => ({ ...r, author: r.authorId ? (byId.get(r.authorId) ?? null) : null })) };
  }

  async addUnitActivity(data: { id: string; organizationId: string; body?: string; authorId?: string; scopeSpaceIds?: SpaceScopeIds }) {
    const unit = await this.prisma.customerUnit.findFirst({ where: { id: data.id, organizationId: data.organizationId, ...this.unitScope(data.scopeSpaceIds) }, select: { id: true } });
    if (!unit) throw new NotFoundException('Unit not found');
    const body = (data.body ?? '').trim().slice(0, 5000);
    if (!body) throw new NotFoundException('Note body required');
    const activity = await this.prisma.unitActivity.create({
      data: { organizationId: data.organizationId, unitId: data.id, type: 'NOTE', body, authorId: data.authorId ?? null },
    });
    return { data: activity };
  }

  /** Units a specific customer is bound to (customer-scoped). */
  async listCustomerUnits(data: { organizationId: string; customerId: string }) {
    return this.prisma.customerUnit.findMany({
      where: { organizationId: data.organizationId, customerId: data.customerId, isActive: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      take: 200,
    });
  }

  /** Make a unit the customer's primary address (unsets the siblings). */
  async setPrimaryUnit(data: { id: string; organizationId: string; customerId?: string; crmCaller?: CrmCaller; scopeSpaceId?: string }) {
    if (data.crmCaller) {
      if (!data.customerId) throw new BadRequestException('A client is required');
      await this.assertClientAddressesEditable(data.organizationId, data.customerId, data.crmCaller);
    }
    const unit = await this.prisma.customerUnit.findFirst({
      where: {
        id: data.id,
        organizationId: data.organizationId,
        ...(data.customerId ? { customerId: data.customerId } : {}),
        // The workspace route's own workspace — see `updateUnit.scopeSpaceId`.
        ...(data.scopeSpaceId ? { spaceId: data.scopeSpaceId } : {}),
      },
      select: { id: true, customerId: true },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    await this.prisma.$transaction([
      ...(unit.customerId
        ? [this.prisma.customerUnit.updateMany({ where: { customerId: unit.customerId, id: { not: unit.id } }, data: { isPrimary: false } })]
        : []),
      this.prisma.customerUnit.update({ where: { id: unit.id }, data: { isPrimary: true } }),
    ]);
    return { success: true };
  }

  async listUnits(data: { organizationId: string; customerId?: string; scopeSpaceIds?: SpaceScopeIds }) {
    return this.prisma.customerUnit.findMany({
      where: {
        organizationId: data.organizationId,
        isActive: true,
        ...(data.customerId ? { customerId: data.customerId } : {}),
        ...this.unitScope(data.scopeSpaceIds),
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
  }

  /**
   * The things this client holds — the generalisation of listUnits.
   *
   * Held BY them (asset.customerId), plus the one their login is confined to if
   * it is not already in that set. A client with a leased machine and a hired
   * van sees both, the same way a resident sees their flat.
   */
  async listAssets(data: { organizationId: string; customerId?: string; assetId?: string | null }) {
    if (!data.customerId && !data.assetId) return [];

    const rows = await this.prisma.asset.findMany({
      where: {
        organizationId: data.organizationId,
        OR: [
          /*
            What they hold, minus what has been retired. This is the list a
            client picks from to raise a request, and a van handed back and
            taken off the books last spring is not something to raise one
            against — its history stays on the organization's side.

            The one their login is CONFINED to is kept whatever its state: it
            is the whole of their portal, and hiding it would leave them signed
            in to an empty screen with no way to ask why.
          */
          ...(data.customerId ? [{ customerId: data.customerId, ...SELECTABLE_ASSET_WHERE }] : []),
          ...(data.assetId ? [{ id: data.assetId }] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        locationAddress: true,
        details: true,
        category: { select: { id: true, name: true, config: true } },
      },
      orderBy: { name: 'asc' },
      take: 200,
    });

    return rows;
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { type CrmCaller } from '../customers/customers.service';
import { SELECTABLE_ASSET_WHERE, type SpaceScopeIds, clientAssets, PrismaService } from '@hbcfield/shared';
import { PortalReachService } from './portal-reach.service';
import { UnitResidentsService } from './unit-residents.service';
import { unitScope } from './portal-scope';
import { withAuthors } from '../../common/records/with-authors';

/** Reading addresses (units): one, a client's, a list, their activity, the assets on them. */
@Injectable()
export class PortalUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reach: PortalReachService,
    private readonly residents: UnitResidentsService,
  ) {}

  async getUnit(data: { id: string; organizationId: string; scopeSpaceIds?: string[] }) {
    const unit = await this.prisma.customerUnit.findFirst({
      where: { id: data.id, organizationId: data.organizationId, ...unitScope(data.scopeSpaceIds) },
      include: { customer: { select: { id: true, name: true, email: true, phone: true } } },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    const [enriched] = await this.residents.withResidentUsers([unit]);
    return { data: enriched };
  }

  async listUnitActivities(data: { id: string; organizationId: string; scopeSpaceIds?: string[] }) {
    const unit = await this.prisma.customerUnit.findFirst({
      where: { id: data.id, organizationId: data.organizationId, ...unitScope(data.scopeSpaceIds) },
      select: { id: true },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    const rows = await this.prisma.unitActivity.findMany({
      where: { unitId: data.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { data: await withAuthors(this.prisma, rows) };
  }

  async addUnitActivity(data: {
    id: string;
    organizationId: string;
    body?: string;
    authorId?: string;
    scopeSpaceIds?: SpaceScopeIds;
  }) {
    const unit = await this.prisma.customerUnit.findFirst({
      where: { id: data.id, organizationId: data.organizationId, ...unitScope(data.scopeSpaceIds) },
      select: { id: true },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    const body = (data.body ?? '').trim().slice(0, 5000);
    if (!body) throw new NotFoundException('Note body required');
    const activity = await this.prisma.unitActivity.create({
      data: {
        organizationId: data.organizationId,
        unitId: data.id,
        type: 'NOTE',
        body,
        authorId: data.authorId ?? null,
      },
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
  async setPrimaryUnit(data: {
    id: string;
    organizationId: string;
    customerId?: string;
    crmCaller?: CrmCaller;
    scopeSpaceId?: string;
  }) {
    if (data.crmCaller) {
      if (!data.customerId) throw new BadRequestException('A client is required');
      await this.reach.assertClientAddressesEditable(data.organizationId, data.customerId, data.crmCaller);
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
        ? [
            this.prisma.customerUnit.updateMany({
              where: { customerId: unit.customerId, id: { not: unit.id } },
              data: { isPrimary: false },
            }),
          ]
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
        ...unitScope(data.scopeSpaceIds),
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

    const rows = await clientAssets(this.prisma, data);

    return rows;
  }
}

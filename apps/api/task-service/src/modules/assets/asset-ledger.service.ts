import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, normalizeKindShape, findMoneyCategory } from '@hbcfield/shared';
import { AssetAccessService } from './asset-access.service';

/**
 * Money logged against a record, and the totals over the whole ledger.
 */
@Injectable()
export class AssetLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
  ) {}

  /**
   * The money logged against one asset, newest first, with the totals.
   *
   * Totals come from a groupBy over the WHOLE ledger, not from summing the page
   * — a total that only counted the rows currently on screen would be wrong the
   * moment there were more than a page of them, and wrong quietly.
   */
  async listMoney(data: {
    id: string;
    limit?: number;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'view assets');
    await this.access.assetInOrg(data.id, data.organizationId);

    const take = Math.min(Math.max(data.limit ?? 100, 1), 200);

    const [entries, sums] = await Promise.all([
      this.prisma.assetMoney.findMany({
        where: { assetId: data.id },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take,
      }),
      this.prisma.assetMoney.groupBy({
        by: ['direction'],
        where: { assetId: data.id },
        _sum: { amountCents: true },
      }),
    ]);

    const totalFor = (direction: string) =>
      sums.find((s) => s.direction === direction)?._sum.amountCents ?? 0;
    const inCents = totalFor('IN');
    const outCents = totalFor('OUT');

    return success({
      entries,
      totals: { inCents, outCents, netCents: inCents - outCents },
    });
  }

  /**
   * Log money against an asset.
   *
   * The category must be one its KIND declares. A free-text heading would split
   * a total between "Repairs" and "repair" and neither half would look wrong.
   * The label is then STORED, so renaming the category later leaves history
   * reading as it did at the time.
   */
  async addMoney(data: {
    id: string;
    category: string;
    amountCents: number;
    note?: string;
    occurredAt?: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'update assets');

    const asset = await this.prisma.asset.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true, category: { select: { config: true } } },
    });
    if (!asset) throw new NotFoundException('Asset not found in this organization');

    const shape = normalizeKindShape(asset.category?.config);
    if (!shape.money.enabled) {
      throw new BadRequestException('This kind does not track money');
    }

    const category = findMoneyCategory(shape, data.category ?? '');
    if (!category) {
      throw new BadRequestException(`"${data.category}" is not a category on this kind`);
    }

    // Cents, and never negative — the direction decides the sign, so a negative
    // amount here would silently invert an entry.
    const amountCents = Math.abs(Math.round(Number(data.amountCents)));
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new BadRequestException('An amount is needed');
    }

    const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('That date could not be read');
    }

    const entry = await this.prisma.assetMoney.create({
      data: {
        organizationId: data.organizationId,
        assetId: data.id,
        category: category.label,
        direction: category.direction === 'in' ? 'IN' : 'OUT',
        amountCents,
        note: data.note?.trim().slice(0, 500) || null,
        occurredAt,
        authorId: data.userId,
      },
    });

    return success(entry);
  }

  /** Remove one entry. Scoped to the asset, so an id alone is not enough. */
  async removeMoney(data: {
    id: string;
    entryId: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'update assets');
    await this.access.assetInOrg(data.id, data.organizationId);

    const { count } = await this.prisma.assetMoney.deleteMany({
      where: { id: data.entryId, assetId: data.id, organizationId: data.organizationId },
    });
    if (!count) throw new NotFoundException('Entry not found');

    return success({ id: data.entryId });
  }
}

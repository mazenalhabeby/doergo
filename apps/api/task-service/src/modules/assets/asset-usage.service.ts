import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BILLABLE_ASSET_WHERE, success } from '@hbcfield/shared';

/**
 * How many assets each space is billed for.
 *
 * The assets module is not a flat switch: a space pays a base price and then a
 * volume ladder over the assets in it (see `usage-pricing.ts` in shared, which
 * owns every number). This service owns only the COUNT. Pricing lives in one
 * place and it is not here, so a screen and an invoice can never disagree about
 * what an asset costs.
 *
 * PER SPACE, because that is how the module is switched on and paid for. The
 * one number a space's screen shows has to be checkable from that screen, and
 * nobody standing in one space can see what is in the others.
 *
 * The exclusions — sub-assets and retired records — come from the shared
 * `BILLABLE_ASSET_WHERE` clause rather than being re-typed, because a count
 * that drifts from the one on the invoice is the worst kind of bug to find.
 */
@Injectable()
export class AssetUsageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Billable assets per space, in three queries however many spaces there are.
   *
   * An asset reaches its space through its TYPE, and Prisma cannot group by a
   * relation's column, so the counts come back per type and are folded onto
   * spaces here. `unassigned` is the ones whose type has no space — they belong
   * to nothing, are billed by nobody, and are listed by `listOrphans` so they
   * can be moved or deleted rather than sitting outside the product.
   */
  async count(organizationId: string) {
    const [types, grouped] = await Promise.all([
      this.prisma.assetCategory.findMany({
        where: { organizationId },
        select: { id: true, spaceId: true },
      }),
      this.prisma.asset.groupBy({
        by: ['categoryId'],
        where: { ...BILLABLE_ASSET_WHERE, organizationId },
        _count: { _all: true },
      }),
    ]);

    const spaceOfType = new Map(types.map((t) => [t.id, t.spaceId]));
    const spaces: Record<string, number> = {};
    let unassigned = 0;
    let total = 0;

    for (const row of grouped) {
      const units = row._count._all;
      total += units;
      const spaceId = row.categoryId ? spaceOfType.get(row.categoryId) ?? null : null;
      if (spaceId) spaces[spaceId] = (spaces[spaceId] ?? 0) + units;
      else unassigned += units;
    }

    return success({ total, unassigned, spaces });
  }
}

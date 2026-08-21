import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BILLABLE_ASSET_WHERE, success } from '@hbcfield/shared';

/**
 * How many assets an organization is billed for.
 *
 * The assets module is not a flat switch: it carries a base price and then a
 * volume ladder over the count (see `usage-pricing.ts` in shared, which owns
 * every number). This service owns only the COUNT — what is billable, and how
 * much of it belongs to the space somebody is currently looking at. Pricing
 * lives in one place and it is not here, so a screen and an invoice can never
 * disagree about what an asset costs.
 *
 * The exclusions — sub-assets and retired records — come from the shared
 * `BILLABLE_ASSET_WHERE` clause rather than being re-typed, because a count
 * that drifts from the one on the invoice is the worst kind of bug to find.
 */
@Injectable()
export class AssetUsageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The org's billable total, and one space's share of it.
   *
   * Both, in one round trip, because the space modules screen needs to answer
   * two different questions at once: what the whole ladder costs, and what THIS
   * space is putting on it. Assets reach a space through their kind, which is
   * where `spaceId` lives — an asset has no space of its own.
   */
  async count(organizationId: string, spaceId?: string | null) {
    const billable = { ...BILLABLE_ASSET_WHERE, organizationId };

    const [orgUnits, spaceUnits] = await Promise.all([
      this.prisma.asset.count({ where: billable }),
      spaceId
        ? this.prisma.asset.count({ where: { ...billable, category: { spaceId } } })
        : Promise.resolve(null),
    ]);

    // The same `{ success, data }` envelope as every other assets read. A bare
    // object here would be unwrapped as `undefined` by the web client and land
    // on screen as a confident zero, which is the worst way for a count to fail.
    return success({ orgUnits, spaceUnits });
  }
}

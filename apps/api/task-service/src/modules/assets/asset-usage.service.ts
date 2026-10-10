import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { countBillableUsage, success } from '@hbcfield/shared';

export type { ModuleUsageCounts } from '@hbcfield/shared';

/**
 * How much of each counted module a space is billed for.
 *
 * Three modules are not flat switches: a space pays a base price and then a
 * volume ladder over what is in it. Assets was the first; CRM (clients) and
 * Client Portal (portals) work the same way. `usage-pricing.ts` in shared owns
 * every number, and the COUNTS come from shared `countBillableUsage` — the same
 * function the bill calls — so a screen and an invoice can never disagree.
 *
 * PER SPACE, because that is how the modules are switched on and paid for. The
 * one number a space's screen shows has to be checkable from that screen, and
 * nobody standing in one space can see what is in the others.
 *
 */
@Injectable()
export class AssetUsageService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every counted module for the space screens — read on every open of a space's Modules tab. */
  async count(organizationId: string) {
    const counts = await countBillableUsage(this.prisma, organizationId);
    return success({
      // Assets stay at the top level as well as under `modules`. The Modules tab
      // is not the only reader — the orphan-assets card and the space header
      // both take these — and moving them would have been a rename dressed up
      // as a feature.
      ...counts.assets,
      modules: counts,
    });
  }
}

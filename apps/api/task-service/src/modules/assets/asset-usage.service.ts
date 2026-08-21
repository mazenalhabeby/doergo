import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  BILLABLE_ASSET_WHERE,
  BILLABLE_CLIENT_WHERE,
  BILLABLE_PORTAL_WHERE,
  success,
} from '@hbcfield/shared';

/** One counted module's numbers for one organization. */
export interface ModuleUsageCounts {
  /** Everything counted, wherever it sits. */
  total: number;
  /** Records that belong to no space — billed by nobody, and worth surfacing. */
  unassigned: number;
  /** spaceId → how many. */
  spaces: Record<string, number>;
}

/**
 * How much of each counted module a space is billed for.
 *
 * Three modules are not flat switches: a space pays a base price and then a
 * volume ladder over what is in it. Assets was the first; CRM (clients) and
 * Client Portal (portals) work the same way. `usage-pricing.ts` in shared owns
 * every number. This service owns only the COUNTS, so a screen and an invoice
 * can never disagree about what any of them costs.
 *
 * PER SPACE, because that is how the modules are switched on and paid for. The
 * one number a space's screen shows has to be checkable from that screen, and
 * nobody standing in one space can see what is in the others.
 *
 * Each module's exclusion rule comes from the shared `BILLABLE_*_WHERE` clauses
 * rather than being re-typed here — a count that drifts from the one on the
 * invoice is the worst kind of bug to find.
 */
@Injectable()
export class AssetUsageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every counted module, in four queries however many spaces there are.
   *
   * Assets need the extra hop: an asset reaches its space through its TYPE, and
   * Prisma cannot group by a relation's column, so their counts come back per
   * type and are folded onto spaces here. Clients and portals carry `spaceId`
   * themselves and group directly.
   *
   * All four run concurrently — the whole thing is one round trip's latency,
   * not four, and it is read on every open of a space's Modules tab.
   */
  async count(organizationId: string) {
    const [types, assetRows, clientRows, portalRows] = await Promise.all([
      this.prisma.assetCategory.findMany({
        where: { organizationId },
        select: { id: true, spaceId: true },
      }),
      this.prisma.asset.groupBy({
        by: ['categoryId'],
        where: { ...BILLABLE_ASSET_WHERE, organizationId },
        _count: { _all: true },
      }),
      this.prisma.customer.groupBy({
        by: ['spaceId'],
        where: { ...BILLABLE_CLIENT_WHERE, organizationId },
        _count: { _all: true },
      }),
      this.prisma.portal.groupBy({
        by: ['spaceId'],
        where: { ...BILLABLE_PORTAL_WHERE, organizationId },
        _count: { _all: true },
      }),
    ]);

    const spaceOfType = new Map(types.map((t) => [t.id, t.spaceId]));

    const assets = this.fold(assetRows, (row) =>
      row.categoryId ? spaceOfType.get(row.categoryId) ?? null : null,
    );
    const crm = this.fold(clientRows, (row) => row.spaceId ?? null);
    const b2c_portal = this.fold(portalRows, (row) => row.spaceId ?? null);

    return success({
      // Assets stay at the top level as well as under `modules`. The Modules tab
      // is not the only reader — the orphan-assets card and the space header
      // both take these — and moving them would have been a rename dressed up
      // as a feature.
      ...assets,
      modules: { assets, crm, b2c_portal },
    });
  }

  /** Group-by rows → per-space counts, given how a row finds its space. */
  private fold<T extends { _count: { _all: number } }>(
    rows: T[],
    spaceOf: (row: T) => string | null,
  ): ModuleUsageCounts {
    const spaces: Record<string, number> = {};
    let unassigned = 0;
    let total = 0;

    for (const row of rows) {
      const units = row._count._all;
      total += units;
      const spaceId = spaceOf(row);
      if (spaceId) spaces[spaceId] = (spaces[spaceId] ?? 0) + units;
      else unassigned += units;
    }

    return { total, unassigned, spaces };
  }
}

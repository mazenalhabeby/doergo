import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  orgMonthlyCost,
  isObserverSeat,
  billsByUsage,
  BILLABLE_ASSET_WHERE,
  BILLABLE_CLIENT_WHERE,
  BILLABLE_PORTAL_WHERE,
  AVAILABLE_MODULES,
  type OrgCostBreakdown,
  type SpaceModules,
} from '@hbcfield/shared';

const MODULE_KEYS = new Set<string>(AVAILABLE_MODULES.map((m) => m.key));

/**
 * What an organization owes, computed from what it actually has.
 *
 * ONE method, used by both the billing screen and the Stripe sync. That is the
 * whole design: the old model let the screen compute a price from a static tier
 * table while Stripe was told something assembled separately, so the two could
 * disagree and only an invoice would reveal it. Here the number a customer reads
 * and the number Stripe is given come out of the same call.
 *
 * The bill has three parts, each priced where it is used:
 *
 *     seats  × €9.99          — one flat seat, no office/field classification
 *   + spaces ( modules + usage ladders )
 *   + org add-ons             — bought once, not per space
 *
 * Every price lives in @hbcfield/shared. Nothing is computed here; this service
 * owns only the COUNTS, which is why a screen and an invoice cannot drift.
 */
@Injectable()
export class OrgBillService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The whole bill, in five concurrent queries regardless of how many spaces the
   * organization has.
   *
   * Counting is deliberately not per space: a naive version reads each space's
   * assets, clients and portals in a loop and turns a billing screen into 3N
   * round trips. These group once across the org and fold onto spaces in memory.
   */
  async compute(organizationId: string): Promise<OrgCostBreakdown> {
    const [org, seatCount, externals, spaces, assetTypes, assetRows, clientRows, portalRows] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { addOns: true },
      }),
      // A seat is an active member. No office/field split — deciding which side
      // somebody was on used to need their access profile, their employment
      // type, and a reconcile job to notice when either changed.
      this.prisma.user.count({ where: { organizationId, isActive: true } }),
      /*
        Candidates for the reduced OBSERVER seat, with the permissions they
        actually hold — the union of their org role and every space role, since
        the price follows the grant and not the name of a role.

        A separate query restricted to external members rather than an include
        on the count above. An organization has a handful of outsiders and can
        have hundreds of staff; joining two role tables onto every staff row to
        answer a question that can only be true for an outsider is work done for
        nothing on the row count that actually grows.
      */
      this.prisma.user.findMany({
        where: { organizationId, isActive: true, isExternal: true },
        select: {
          isExternal: true,
          memberRole: { select: { permissions: true } },
          spaceAssignments: {
            where: { OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] },
            select: { role: { select: { permissions: true } } },
          },
        },
      }),
      this.prisma.companyLocation.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, name: true, enabledModules: true },
      }),
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

    // An asset reaches its space through its TYPE — Prisma cannot group by a
    // relation's column, so fold the per-type counts onto spaces here.
    const spaceOfType = new Map(assetTypes.map((t) => [t.id, t.spaceId]));
    const assetsBySpace = new Map<string, number>();
    for (const row of assetRows) {
      const spaceId = row.categoryId ? spaceOfType.get(row.categoryId) ?? null : null;
      if (spaceId) assetsBySpace.set(spaceId, (assetsBySpace.get(spaceId) ?? 0) + row._count._all);
    }
    const clientsBySpace = new Map(
      clientRows.filter((r) => r.spaceId).map((r) => [r.spaceId as string, r._count._all]),
    );
    const portalsBySpace = new Map(
      portalRows.filter((r) => r.spaceId).map((r) => [r.spaceId as string, r._count._all]),
    );

    const spaceInput: SpaceModules[] = spaces.map((s) => {
      // A stale key left on a space must never reach an invoice as a line
      // nobody can switch off — filter to the catalogue on the way in.
      const enabled = (Array.isArray(s.enabledModules) ? (s.enabledModules as unknown[]) : [])
        .filter((k): k is string => typeof k === 'string' && MODULE_KEYS.has(k));

      // Only a module the space actually switched on can carry a count.
      // Otherwise turning CRM off would still bill for the clients sitting in it.
      const usage: Record<string, number> = {};
      for (const key of enabled) {
        if (!billsByUsage(key)) continue;
        if (key === 'assets') usage[key] = assetsBySpace.get(s.id) ?? 0;
        else if (key === 'crm') usage[key] = clientsBySpace.get(s.id) ?? 0;
        else if (key === 'b2c_portal') usage[key] = portalsBySpace.get(s.id) ?? 0;
      }

      return { spaceId: s.id, spaceName: s.name, enabledModules: enabled, usage };
    });

    /*
      An observer is not ALSO a full seat.

      `seatCount` counted every active member, these included, so the reduced
      seats come back out of the full total. Billing both would charge the same
      person twice — once at each price — and the invoice would add up to more
      people than the organization has.
    */
    let observerSeatCount = 0;
    for (const u of externals) {
      const held = new Set<string>();
      const add = (perms: unknown) => {
        if (!perms || typeof perms !== 'object') return;
        for (const [k, v] of Object.entries(perms as Record<string, unknown>)) {
          if (v === true) held.add(k);
        }
      };
      add(u.memberRole?.permissions);
      for (const a of u.spaceAssignments) add(a.role?.permissions);
      if (isObserverSeat(u, [...held])) observerSeatCount += 1;
    }

    return orgMonthlyCost({
      seatCount: Math.max(0, seatCount - observerSeatCount),
      observerSeatCount,
      // The externals who are NOT observers — supervisors, at the full seat
      // price. Shown separately so "People × €9.99" does not quietly include
      // somebody else's employees.
      externalSeatCount: Math.max(0, externals.length - observerSeatCount),
      spaces: spaceInput,
      addOns: org?.addOns ?? [],
    });
  }
}

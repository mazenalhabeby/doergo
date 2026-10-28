import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  assertMemberInScope,
  success,
  normalizeKindShape,
  totalsByPeriod,
  type CustodyPeriod,
  clientContacts,
  peopleContacts,
  PrismaService,
} from '@hbcfield/shared';
import { AssetAccessService, type AssetActor } from '../core/asset-access.service';
import { CUSTODY_SELECT } from './asset-custody-helpers';

/**
 * Reading custody: one asset's timeline, what a member holds and has held, what I
 * hold, who holds a thing now.
 */
@Injectable()
export class CustodyReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Reading
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * One asset's timeline, with what it cost during each period.
   *
   * Two queries whatever the length: every period, every entry, and the split
   * computed in memory by the same shared function the browser uses. The
   * obvious alternative — a SUM per period — is a query per handover, and a van
   * kept for five years has a lot of handovers.
   */
  async timeline(data: { id: string } & AssetActor) {
    await this.access.assetInScope(data.id, data, 'view');

    const [periods, entries] = await Promise.all([
      this.prisma.assetCustody.findMany({
        where: { assetId: data.id },
        orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
        select: CUSTODY_SELECT,
      }),
      // Only what counts. A submitted-but-unreviewed receipt must not move a
      // driver's total before anybody has accepted it.
      this.prisma.assetMoney.findMany({
        // The author rides along so a shared machine's cost goes to the holder who logged it.
        where: { assetId: data.id, status: 'RECORDED', amountCents: { gt: 0 } },
        select: { occurredAt: true, amountCents: true, direction: true, authorId: true },
      }),
    ]);

    const { byPeriod, unattributed } = totalsByPeriod(entries, periods as unknown as CustodyPeriod[]);
    const named = await this.withNames(periods, data.organizationId);

    return success({
      periods: named.map((p, i) => ({
        ...p,
        totals: byPeriod.get(periods[i] as unknown as CustodyPeriod) ?? {
          inCents: 0,
          outCents: 0,
          netCents: 0,
          entries: 0,
        },
      })),
      unattributed,
    });
  }

  /**
   * Everything one member holds or has held, and what each cost them.
   *
   * The other half of the question: the asset page answers "who has had this
   * van", this answers "which vans has Ahmed had". Same rows, read the other
   * way round — which is exactly why custody is a table and not a JSON blob on
   * an activity entry.
   */
  async forMember(
    data: {
      memberId: string;
      open?: boolean;
    } & AssetActor,
  ) {
    this.access.assertMay(data, 'view');
    // Another organization's member is 404, like a missing one — never an empty answer.
    await assertMemberInScope(this.prisma, { userId: data.memberId, organizationId: data.organizationId });
    /*
      Only the periods of records the caller may read. A depot manager asking
      what Ahmed holds sees the depot's vans he has — never the laptop another
      workspace gave him, nor an org-level record no workspace reaches.
    */
    const kind = this.access.spaceFilter(data, 'view');
    return this.periodsFor(
      {
        userId: data.memberId,
        organizationId: data.organizationId,
        ...(data.open ? { endedAt: null } : {}),
        ...(kind ? { asset: { category: kind } } : {}),
      },
      data.organizationId,
    );
  }

  /**
   * What the caller holds right now — the phone's home screen.
   *
   * Deliberately NOT gated on `canViewAllTasks`: a driver is not an asset
   * manager and never will be, and asking them to be one to see their own van
   * is how a feature ends up unusable by the only people who need it. The
   * filter IS the authorization — it can only ever return rows whose custody
   * names the caller.
   */
  async mine(data: { userId: string; organizationId: string }) {
    const [held, canPropose] = await Promise.all([
      this.periodsFor({ userId: data.userId, organizationId: data.organizationId, endedAt: null }, data.organizationId),
      this.organizationHoldsThings(data.organizationId),
    ]);
    /*
      `canPropose` is what lets the phone decide whether to OFFER "send a
      document" at all.

      An empty `periods` cannot answer it: a member holds nothing both when the
      organization runs no assets and when they simply have not been given one —
      and the second is precisely the person the proposals feature exists for.
      Without this the button would be hidden from everybody who needs it, or
      shown to every organization that never bought Assets.
    */
    return success({ ...held.data, canPropose });
  }

  /** Does anything here get handed to a member at all? One small query. */
  private async organizationHoldsThings(organizationId: string): Promise<boolean> {
    const kinds = await this.prisma.assetCategory.findMany({
      where: { organizationId },
      select: { config: true },
      take: 50,
    });
    return kinds.some((k) => {
      const shape = normalizeKindShape(k.config);
      return shape.holder.enabled && shape.holder.members;
    });
  }

  private async periodsFor(where: Prisma.AssetCustodyWhereInput, organizationId: string) {
    const periods = await this.prisma.assetCustody.findMany({
      where,
      orderBy: [{ endedAt: 'asc' }, { startedAt: 'desc' }],
      take: 200,
      select: {
        ...CUSTODY_SELECT,
        asset: {
          select: {
            id: true,
            name: true,
            status: true,
            serialNumber: true,
            model: true,
            manufacturer: true,
            category: { select: { id: true, name: true, icon: true, color: true, config: true, spaceId: true } },
          },
        },
      },
    });
    if (periods.length === 0) return success({ periods: [] });

    /*
      What each of them cost DURING that period — one query for every asset
      involved, not one per period. A member who has had six vans over two years
      is six ids in a single `IN`, and the split is arithmetic afterwards.
    */
    const assetIds = [...new Set(periods.map((p) => p.assetId))];
    const entries = await this.prisma.assetMoney.findMany({
      where: { assetId: { in: assetIds }, organizationId, status: 'RECORDED', amountCents: { gt: 0 } },
      select: { assetId: true, occurredAt: true, amountCents: true, direction: true, authorId: true },
    });

    const byAsset = new Map<string, typeof entries>();
    for (const e of entries) {
      const list = byAsset.get(e.assetId);
      if (list) list.push(e);
      else byAsset.set(e.assetId, [e]);
    }

    const out = periods.map((p) => {
      const mine = byAsset.get(p.assetId) ?? [];
      const { byPeriod } = totalsByPeriod(mine, [p as unknown as CustodyPeriod]);
      return {
        ...p,
        totals: byPeriod.get(p as unknown as CustodyPeriod) ?? { inCents: 0, outCents: 0, netCents: 0, entries: 0 },
      };
    });

    return success({ periods: out });
  }

  /**
   * Fill in the names.
   *
   * One query for the members and one for the clients, however long the
   * timeline — the screen most likely to grow, and an N+1 here would be felt on
   * every open.
   */
  private async withNames<T extends { userId: string | null; customerId: string | null }>(
    periods: T[],
    organizationId: string,
  ): Promise<Array<T & { user: unknown; customer: unknown }>> {
    const userIds = [...new Set(periods.map((p) => p.userId).filter((v): v is string => !!v))];
    const customerIds = [...new Set(periods.map((p) => p.customerId).filter((v): v is string => !!v))];

    const [users, customers] = await Promise.all([
      userIds.length ? peopleContacts(this.prisma, userIds, organizationId) : Promise.resolve([]),
      customerIds.length ? clientContacts(this.prisma, customerIds, organizationId) : Promise.resolve([]),
    ]);

    const byUser = new Map(users.map((u) => [u.id, u]));
    const byCustomer = new Map(customers.map((c) => [c.id, c]));

    return periods.map((p) => ({
      ...p,
      user: p.userId ? (byUser.get(p.userId) ?? null) : null,
      customer: p.customerId ? (byCustomer.get(p.customerId) ?? null) : null,
    }));
  }

  /**
   * Does this person hold this asset — now, or on a given date?
   *
   * The gate on a member filing an expense. Asked of the DATE the money moved
   * rather than of today, so somebody can file yesterday's fuel the morning
   * after they hand the van back and cannot file a receipt for a van they have
   * never driven.
   */
  async heldBy(assetId: string, userId: string, when: Date): Promise<boolean> {
    const hit = await this.prisma.assetCustody.findFirst({
      where: {
        assetId,
        userId,
        startedAt: { lte: when },
        OR: [{ endedAt: null }, { endedAt: { gt: when } }],
      },
      select: { id: true },
    });
    return !!hit;
  }
}

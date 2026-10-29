import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  assertMemberInScope,
  success,
  normalizeKindShape,
  totalsByPeriod,
  custodyDayWindow,
  workspaceZone,
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
    const asset = await this.access.assetInScope(data.id, data, 'view');

    const [periods, entries, timeZone] = await Promise.all([
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
      this.zoneOf({ spaceId: asset.spaceId, organizationId: data.organizationId }),
    ]);

    const { byPeriod, unattributed } = totalsByPeriod(entries, periods as unknown as CustodyPeriod[], { timeZone });
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
      // The zone the ledger's days are read in — the web attributes each row by it.
      timeZone,
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
    const spaceIds = [...new Set(periods.map((p) => p.asset.category?.spaceId ?? null))];
    /*
      Every period of those assets, not only this member's: who a day-dated cost
      belongs to depends on who ELSE held it that day (`entryHolder`), and a
      member's view must agree with the asset's own timeline.
    */
    const [entries, everyPeriod, zones] = await Promise.all([
      this.prisma.assetMoney.findMany({
        where: { assetId: { in: assetIds }, organizationId, status: 'RECORDED', amountCents: { gt: 0 } },
        select: { assetId: true, occurredAt: true, amountCents: true, direction: true, authorId: true },
      }),
      this.prisma.assetCustody.findMany({ where: { assetId: { in: assetIds } }, select: CUSTODY_SELECT }),
      Promise.all(spaceIds.map((spaceId) => this.zoneOf({ spaceId, organizationId }))),
    ]);
    const zoneBySpace = new Map(spaceIds.map((id, i) => [id, zones[i]]));

    const group = <T extends { assetId: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) {
        const list = m.get(r.assetId);
        if (list) list.push(r);
        else m.set(r.assetId, [r]);
      }
      return m;
    };
    const entriesOf = group(entries);
    const periodsOf = group(everyPeriod);

    const out = periods.map((p) => {
      const all = (periodsOf.get(p.assetId) ?? []) as unknown as CustodyPeriod[];
      const timeZone = zoneBySpace.get(p.asset.category?.spaceId ?? null);
      const { byPeriod } = totalsByPeriod(entriesOf.get(p.assetId) ?? [], all, { timeZone });
      const own = all.find((q) => q.id === p.id);
      return {
        ...p,
        totals: (own && byPeriod.get(own)) ?? { inCents: 0, outCents: 0, netCents: 0, entries: 0 },
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
   * Did this person hold this asset at ANY moment of the local day `when` falls on?
   *
   * The gate on a member filing an expense or a logbook entry. A receipt carries
   * a DAY, not a moment (a past day is filed as its local noon), so it is asked
   * of the whole day in the record's workspace zone — the decision of
   * 2026-10-29, the same rule `heldDuringDay` / `entryHolder` in shared apply,
   * so a slip let through here is charged to the person who filed it. Somebody
   * can file yesterday's fuel the morning after they hand the van back, and
   * cannot file a receipt for a van they have never driven.
   */
  async heldBy(
    assetId: string,
    userId: string,
    when: Date,
    place: { spaceId: string | null; organizationId: string },
  ): Promise<boolean> {
    const { from, to } = custodyDayWindow(when, await this.zoneOf(place));
    const hit = await this.prisma.assetCustody.findFirst({
      where: {
        assetId,
        userId,
        startedAt: { lt: to },
        OR: [{ endedAt: null }, { endedAt: { gt: from } }],
      },
      select: { id: true },
    });
    return !!hit;
  }

  /** The zone a record's day is read in: its workspace's, else the organization's, else UTC. */
  zoneOf(place: { spaceId: string | null; organizationId: string }): Promise<string> {
    return workspaceZone(this.prisma, place);
  }
}

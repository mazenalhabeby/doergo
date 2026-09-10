import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  success,
  normalizeKindShape,
  maxHolders,
  planHandover,
  partiesAfter,
  totalsByPeriod,
  type CustodyParty,
  type CustodyPeriod,
  type HandoverPlan,
} from '@hbcfield/shared';
import { AssetAccessService } from './asset-access.service';

/** Anything that can run the two tables — the client, or a transaction. */
type Db = Pick<PrismaService, 'assetCustody' | 'assetHolder' | 'assetMoney' | 'asset' | 'user'>;

/**
 * Who held a thing, and when.
 *
 * The one place custody is written. `AssetHolder` (who has it NOW) and
 * `AssetCustody` (who has had it) are two views of one fact, so they are
 * written together, in one transaction, by this service and nothing else —
 * two writers would let them drift, and a drift here is a ledger attributed to
 * the wrong person with nothing on screen to suggest it.
 *
 * ⚠️ The holder is never written onto a cost. Every money entry carries the
 * date the money moved; who held the asset that day is computed by `holderOn`
 * in shared. Storing it as well would produce two answers the first time
 * somebody corrected a handover date, which is the likeliest repair in the
 * whole feature.
 */
@Injectable()
export class AssetCustodyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
  ) {}

  /** The columns every reader here needs, and no more. */
  private static readonly select = {
    id: true,
    assetId: true,
    userId: true,
    customerId: true,
    startedAt: true,
    endedAt: true,
    reason: true,
    openedById: true,
    closedById: true,
  } as const;

  // ───────────────────────────────────────────────────────────────────────────
  // Writing
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Move an asset from whoever holds it to whoever should.
   *
   * `planHandover` decides what happens; this only carries it out. The confirm
   * dialog calls the SAME function to render "closes Ahmed's custody, opens
   * Mira's", so what a person agreed to and what was written cannot differ.
   *
   * ⚠️ Must be called inside a transaction that also writes `AssetHolder` —
   * `apply` below is the only entry point that guarantees it.
   */
  private async write(
    db: Db,
    input: {
      assetId: string;
      organizationId: string;
      actorId: string;
      plan: HandoverPlan;
      reason?: string | null;
    },
  ): Promise<void> {
    const { plan } = input;
    const at = plan.at;

    if (plan.closing.length) {
      await db.assetCustody.updateMany({
        where: { id: { in: plan.closing.map((p) => p.id!).filter(Boolean) } },
        data: { endedAt: at, closedById: input.actorId, ...(input.reason ? { reason: input.reason } : {}) },
      });
    }

    if (plan.opening.length) {
      await db.assetCustody.createMany({
        data: plan.opening.map((party) => ({
          organizationId: input.organizationId,
          assetId: input.assetId,
          userId: party.userId ?? null,
          customerId: party.customerId ?? null,
          startedAt: at,
          openedById: input.actorId,
          reason: input.reason ?? null,
        })),
      });
    }

    await this.mirror(db, input.assetId, partiesAfter(plan));
  }

  /**
   * Make `AssetHolder` say exactly what the open periods say.
   *
   * Replaced as a set rather than diffed: the set is small and bounded, the
   * write is atomic either way, and a diff would be three queries and a class
   * of bug in exchange for saving one — the same reasoning the holders service
   * already applies.
   */
  private async mirror(db: Db, assetId: string, parties: CustodyParty[]): Promise<void> {
    await db.assetHolder.deleteMany({ where: { assetId } });
    if (parties.length) {
      await db.assetHolder.createMany({
        data: parties.map((p) => ({
          assetId,
          userId: p.userId ?? null,
          customerId: p.customerId ?? null,
        })),
        skipDuplicates: true,
      });
    }
  }

  /** Do these two sets name different people? Compared as SETS, not lists. */
  private differs(a: CustodyParty[], b: CustodyParty[]): boolean {
    const key = (p: CustodyParty) => (p.userId ? `u:${p.userId}` : `c:${p.customerId}`);
    const left = [...new Set(a.map(key))].sort();
    const right = [...new Set(b.map(key))].sort();
    return left.length !== right.length || left.some((v, i) => v !== right[i]);
  }

  /** The open periods of one asset, read for a plan. */
  private async openFor(db: Db, assetId: string): Promise<CustodyPeriod[]> {
    return db.assetCustody.findMany({
      where: { assetId, endedAt: null },
      select: AssetCustodyService.select,
    }) as unknown as Promise<CustodyPeriod[]>;
  }

  /**
   * Apply a change of holder, whatever asked for it.
   *
   * Both routes into this come here: the explicit "hand it over" button, and an
   * edit of the record that happens to change who holds it. One path means the
   * timeline is complete however somebody got there — an edit that quietly
   * skipped it would leave a gap nobody could explain later.
   */
  async apply(
    db: Db,
    input: {
      assetId: string;
      organizationId: string;
      actorId: string;
      to: CustodyParty[];
      at?: Date | string;
      reason?: string | null;
      limit: number;
      /** Throw on a refusal, or return quietly having done nothing. */
      strict?: boolean;
    },
  ): Promise<HandoverPlan> {
    // The periods AND the row that mirrors them, together: a no-op plan still
    // has to be able to notice that the two disagree. See below.
    const [periods, held] = await Promise.all([
      this.openFor(db, input.assetId),
      db.assetHolder.findMany({ where: { assetId: input.assetId }, select: { userId: true, customerId: true } }),
    ]);
    const plan = planHandover({ periods, to: input.to, at: input.at, limit: input.limit });

    if (plan.problems.length) {
      /*
        `nobody` means the plan is a no-op — the same people keep it. That is
        not an error on the edit path (saving a record without touching the
        driver must not fail), and it is not an error on the button either:
        there is simply nothing to write.
      */
      const onlyNoop = plan.problems.every((p) => p.kind === 'nobody');
      if (onlyNoop) {
        /*
          ⚠️ Except when the mirror has drifted.

          If `AssetHolder` names somebody with no open period — an asset that
          predates this, or a half-written state — then "nobody" is the answer
          to the wrong question: the plan compares against the PERIODS, sees no
          change, and the stale holder row survives every attempt to clear it.
          Nothing on any screen would show why. Reconciling here makes the
          drift self-healing on the next save instead of permanent.
        */
        if (this.differs(held, partiesAfter(plan))) {
          await this.mirror(db, input.assetId, partiesAfter(plan));
        }
        return plan;
      }
      if (input.strict) throw new BadRequestException(this.explain(plan));
      return plan;
    }

    await this.write(db, {
      assetId: input.assetId,
      organizationId: input.organizationId,
      actorId: input.actorId,
      plan,
      reason: input.reason,
    });
    return plan;
  }

  /** A refusal in the words the person reads, not a problem code. */
  private explain(plan: HandoverPlan): string {
    const first = plan.problems[0]!;
    switch (first.kind) {
      case 'too-many':
        return first.limit === 1
          ? 'This type is held by one at a time. Change the type to allow several.'
          : `At most ${first.limit} at a time.`;
      case 'future':
        return 'A handover cannot be dated in the future — record it when it happens.';
      case 'before-start':
        return 'That date is before the current holder was given it.';
      default:
        return 'Nothing to change.';
    }
  }

  /**
   * The button: hand this asset to somebody, now or on a past date.
   */
  async handOver(data: {
    id: string;
    to?: CustodyParty[];
    at?: string;
    reason?: string;
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
    const limit = maxHolders(shape);
    if (limit === 0) throw new BadRequestException('This type is not held by anybody');

    const to = await this.validateParties(data.to ?? [], data.organizationId, shape);

    const plan = await this.prisma.$transaction((tx) =>
      this.apply(tx as unknown as Db, {
        assetId: data.id,
        organizationId: data.organizationId,
        actorId: data.userId,
        to,
        at: data.at,
        reason: data.reason?.trim().slice(0, 300) || null,
        limit,
        strict: true,
      }),
    );

    return success({
      closed: plan.closing.length,
      opened: plan.opening.length,
      at: plan.at,
    });
  }

  /**
   * Are these people ours, and does the kind allow them?
   *
   * Two queries however many arrive, and both scoped to the organization, so an
   * id guessed from another tenant comes back missing rather than accepted —
   * the same shape as the holders service, for the same reason.
   */
  private async validateParties(
    raw: CustodyParty[],
    organizationId: string,
    shape: ReturnType<typeof normalizeKindShape>,
  ): Promise<CustodyParty[]> {
    const userIds = new Set<string>();
    const customerIds = new Set<string>();

    for (const p of raw) {
      const userId = typeof p?.userId === 'string' ? p.userId.trim() : '';
      const customerId = typeof p?.customerId === 'string' ? p.customerId.trim() : '';
      if (userId && customerId) {
        throw new BadRequestException('A holder is either a member or a client, not both');
      }
      if (userId) userIds.add(userId);
      else if (customerId) customerIds.add(customerId);
    }

    if (userIds.size && !shape.holder.members) {
      throw new BadRequestException('This type is held by clients, not members');
    }
    if (customerIds.size && !shape.holder.clients) {
      throw new BadRequestException('This type is held by members, not clients');
    }

    const [members, clients] = await Promise.all([
      userIds.size
        ? this.prisma.user.findMany({ where: { id: { in: [...userIds] }, organizationId }, select: { id: true } })
        : Promise.resolve([]),
      customerIds.size
        ? this.prisma.customer.findMany({ where: { id: { in: [...customerIds] }, organizationId }, select: { id: true } })
        : Promise.resolve([]),
    ]);
    if (members.length !== userIds.size) {
      throw new BadRequestException('Someone on that list is not in this organization');
    }
    if (clients.length !== customerIds.size) {
      throw new BadRequestException('A client on that list is not in this organization');
    }

    return [
      ...[...userIds].map((userId) => ({ userId })),
      ...[...customerIds].map((customerId) => ({ customerId })),
    ];
  }

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
  async timeline(data: {
    id: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'view assets');
    await this.access.assetInOrg(data.id, data.organizationId);

    const [periods, entries] = await Promise.all([
      this.prisma.assetCustody.findMany({
        where: { assetId: data.id },
        orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
        select: AssetCustodyService.select,
      }),
      // Only what counts. A submitted-but-unreviewed receipt must not move a
      // driver's total before anybody has accepted it.
      this.prisma.assetMoney.findMany({
        where: { assetId: data.id, status: 'RECORDED' },
        select: { occurredAt: true, amountCents: true, direction: true },
      }),
    ]);

    const { byPeriod, unattributed } = totalsByPeriod(entries, periods as unknown as CustodyPeriod[]);
    const named = await this.withNames(periods, data.organizationId);

    return success({
      periods: named.map((p, i) => ({
        ...p,
        totals: byPeriod.get(periods[i] as unknown as CustodyPeriod) ?? {
          inCents: 0, outCents: 0, netCents: 0, entries: 0,
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
  async forMember(data: {
    memberId: string;
    open?: boolean;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'view assets');
    return this.periodsFor(
      { userId: data.memberId, organizationId: data.organizationId, ...(data.open ? { endedAt: null } : {}) },
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
    return this.periodsFor(
      { userId: data.userId, organizationId: data.organizationId, endedAt: null },
      data.organizationId,
    );
  }

  private async periodsFor(where: Prisma.AssetCustodyWhereInput, organizationId: string) {
    const periods = await this.prisma.assetCustody.findMany({
      where,
      orderBy: [{ endedAt: 'asc' }, { startedAt: 'desc' }],
      take: 200,
      select: {
        ...AssetCustodyService.select,
        asset: {
          select: {
            id: true, name: true, status: true, serialNumber: true, model: true, manufacturer: true,
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
      where: { assetId: { in: assetIds }, organizationId, status: 'RECORDED' },
      select: { assetId: true, occurredAt: true, amountCents: true, direction: true },
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
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds }, organizationId },
            select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
          })
        : Promise.resolve([]),
      customerIds.length
        ? this.prisma.customer.findMany({
            where: { id: { in: customerIds }, organizationId },
            select: { id: true, name: true, email: true, phone: true },
          })
        : Promise.resolve([]),
    ]);

    const byUser = new Map(users.map((u) => [u.id, u]));
    const byCustomer = new Map(customers.map((c) => [c.id, c]));

    return periods.map((p) => ({
      ...p,
      user: p.userId ? byUser.get(p.userId) ?? null : null,
      customer: p.customerId ? byCustomer.get(p.customerId) ?? null : null,
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

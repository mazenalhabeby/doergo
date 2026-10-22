import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  success,
  normalizeKindShape,
  maxHolders,
  type CustodyParty,
  type HandoverPlan,
  clientIds,
  peopleIds,
} from '@hbcfield/shared';
import { type AssetActor } from '../core/asset-access.service';
import { Db } from './asset-custody-helpers';
import { AssetCustodyBase } from './asset-custody.base';

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
export class AssetCustodyService extends AssetCustodyBase {
  /**
   * Tell the people a handover moved something towards or away from.
   *
   * ⚠️ Separate from `apply`, and called by whoever owns the transaction once
   * it has COMMITTED. `apply` runs inside the caller's transaction, so a push
   * sent from there could announce a van that a later step rolls back. Every
   * path that calls `apply` calls this after — the button below, an edit that
   * changes the driver, a contract — so however somebody got the thing, they
   * are told the same way.
   */
  async announce(input: {
    organizationId: string;
    assetId: string;
    actorId: string;
    plan: HandoverPlan;
  }): Promise<void> {
    await this.notifier.handedOver(input);
  }

  /**
   * The button: hand this asset to somebody, now or on a past date.
   */
  async handOver(
    data: {
      id: string;
      to?: CustodyParty[];
      at?: string;
      reason?: string;
    } & AssetActor,
  ) {
    // Reassigning the organization's property: management, in the record's own workspace.
    await this.access.assetInScope(data.id, data, 'manage');

    const asset = await this.prisma.asset.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true, category: { select: { config: true, spaceId: true } } },
    });
    if (!asset) throw new NotFoundException('Asset not found in this organization');

    const shape = normalizeKindShape(asset.category?.config);
    const limit = maxHolders(shape);
    if (limit === 0) throw new BadRequestException('This type is not held by anybody');

    /*
      Somebody who manages assets in ONE workspace hands its equipment to that
      workspace's people and clients, never to anybody in the organization —
      otherwise a client's site manager could move our van to a person they
      cannot even see. An org-wide manager (manageSpaceIds null/undefined) is
      not narrowed.
    */
    const within = Array.isArray(data.manageSpaceIds) ? (asset.category?.spaceId ?? null) : undefined;
    const to = await this.validateParties(data.to ?? [], data.organizationId, shape, within);

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
    await this.announce({ organizationId: data.organizationId, assetId: data.id, actorId: data.userId, plan });

    return success({
      closed: plan.closing.length,
      opened: plan.opening.length,
      at: plan.at,
    });
  }

  /**
   * Everything this person holds comes back to the organization — they are leaving.
   *
   * Through `apply`, the one writer for custody, so each asset's timeline gets
   * its closing period and the `AssetHolder` mirror follows. Leaving custody
   * open would keep attributing costs to somebody who no longer works here.
   * A co-holder keeps their own period: only this person's ends.
   */
  async releaseAllHeldBy(organizationId: string, userId: string, actorId: string): Promise<number> {
    const held = await this.prisma.assetCustody.findMany({
      where: { organizationId, userId, endedAt: null },
      select: { assetId: true, asset: { select: { category: { select: { config: true } } } } },
    });
    let released = 0;
    for (const h of held) {
      const limit = maxHolders(normalizeKindShape(h.asset?.category?.config));
      const others = (await this.openFor(this.prisma as unknown as Db, h.assetId))
        .filter((p) => p.userId !== userId)
        .map((p) => (p.userId ? { userId: p.userId } : { customerId: p.customerId! })) as CustodyParty[];
      await this.prisma.$transaction((tx) =>
        this.apply(tx as unknown as Db, {
          assetId: h.assetId,
          organizationId,
          actorId,
          to: others,
          reason: 'Member left the organization',
          limit: Math.max(limit, others.length),
          strict: false,
        }),
      );
      released++;
    }
    return released;
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
    /** Only parties of this workspace (a workspace-scoped manager); null = none qualify; undefined = anyone in the organization. */
    withinSpaceId?: string | null,
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
        ? peopleIds(this.prisma, [...userIds], {
            organizationId,
            ...(withinSpaceId === undefined ? {} : { inWorkspace: withinSpaceId ?? null }),
          })
        : Promise.resolve([]),
      customerIds.size ? clientIds(this.prisma, [...customerIds], organizationId, withinSpaceId) : Promise.resolve([]),
    ]);
    if (members.length !== userIds.size) {
      throw new BadRequestException(
        withinSpaceId === undefined
          ? 'Someone on that list is not in this organization'
          : 'Someone on that list does not work in this workspace',
      );
    }
    if (clients.length !== customerIds.size) {
      throw new BadRequestException(
        withinSpaceId === undefined
          ? 'A client on that list is not in this organization'
          : 'A client on that list is not filed in this workspace',
      );
    }

    return [...[...userIds].map((userId) => ({ userId })), ...[...customerIds].map((customerId) => ({ customerId }))];
  }
}

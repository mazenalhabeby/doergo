import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeKindShape } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { AssetAccessService } from '../core/asset-access.service';
import { CustodyReadService } from '../custody/custody-read.service';
import { Actor } from './asset-log-helpers';

/**
 * The logbook's doors: loading the asset with its kind's shape, who may SEE its
 * register, and who may LOG against it on a given date.
 */
@Injectable()
export class AssetLogAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
    private readonly custodyRead: CustodyReadService,
  ) {}

  async loadAsset(id: string, organizationId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, organizationId },
      select: { id: true, name: true, category: { select: { config: true, spaceId: true } } },
    });
    if (!asset) throw new NotFoundException('Asset not found in this organization');
    return { ...asset, shape: normalizeKindShape(asset.category?.config), spaceId: asset.category?.spaceId ?? null };
  }

  /**
   * Can this person SEE this asset's register?
   *
   * The door plus the workspace: a grant held in the depot opens the depot's
   * vans, not the Linz office's. Asked of the KIND's workspace, which is the
   * gap a space-scoped reader would otherwise walk through.
   */
  assertSees(actor: Actor, spaceId: string | null): void {
    this.access.assertMay(actor, 'view');
    // 404-shaped: the asset exists, but not for this reader.
    if (!this.access.mayIn(actor, 'view', spaceId)) throw new NotFoundException('Asset not found in this organization');
  }

  /**
   * May this person log this type against this asset, on this date?
   *
   *   · Whoever manages the record's workspace — always: the office types in
   *     what the garage sent, holder-only or not.
   *   · Whoever held it on that date — the driver's own fuel, by custody.
   *   · Whoever may LOG in the record's workspace (`canLogAssets`) — any type
   *     that is not holder-only: the colleague who noticed the dent.
   *
   * ⚠️ Seeing a record is no longer enough to write to it. Logging became its
   * own key so that "may watch the vans" and "may put entries in their book"
   * can be given separately — an External Observer must be able to have the
   * first without the second.
   *
   * ⚠️ An external member never passes on custody: they hold nothing of the
   * organization's. Their reach is `canLogAssets` in their workspace, nothing
   * else.
   */
  async assertMayLog(
    actor: Actor,
    asset: { id: string; spaceId: string | null },
    holderOnly: boolean,
    when: Date,
  ): Promise<void> {
    if (this.access.mayIn(actor, 'manage', asset.spaceId)) return;
    if (actor.isExternal !== true && (await this.custodyRead.heldBy(asset.id, actor.userId, when))) return;
    if (!holderOnly && this.access.mayIn(actor, 'log', asset.spaceId)) return;
    throw new ForbiddenException(holderOnly ? 'You did not have this on that date' : 'You cannot log against this');
  }
}

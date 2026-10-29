import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { AssetAccessService, type AssetActor } from '../core/asset-access.service';
import { CustodyReadService } from '../custody/custody-read.service';

/**
 * The custody gate on a receipt's date: who may file money against a thing.
 *
 * ⚠️ AUTHORIZATION IS CUSTODY, NOT A PERMISSION — asked of the day the money
 * moved, not of today (see AssetExpenseService).
 */
@Injectable()
export class AssetExpenseGateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
    private readonly custodyRead: CustodyReadService,
  ) {}

  /**
   * May this person file against this asset, for this date?
   *
   * Held it then, or may LOG against assets in its workspace (`canLogAssets`,
   * which managing implies). Returns the asset's kind, because every caller
   * needs it next and reading it twice is a second round trip on a path that
   * runs at a petrol pump on one bar of signal.
   *
   * ⚠️ An external member never passes on custody: they hold nothing of the
   * organization's, and a custody row naming one is a mistake to refuse, not
   * an authorisation to honour. The routes are `@DenyExternal` too — this is
   * the second lock.
   */
  async assertMayFile(data: { id: string } & AssetActor, when: Date) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true, name: true, category: { select: { config: true, spaceId: true } } },
    });
    if (!asset) throw new NotFoundException('Asset not found in this organization');
    const spaceId = asset.category?.spaceId ?? null;

    const mayLog = this.access.mayIn(data, 'log', spaceId);
    // Held it at any moment of that DAY, in the workspace's zone (custody-read heldBy).
    const place = { spaceId, organizationId: data.organizationId };
    if (!mayLog && (data.isExternal === true || !(await this.custodyRead.heldBy(data.id, data.userId, when, place)))) {
      /*
        404-shaped in wording, 403 in code, deliberately: the caller already
        knows this asset exists — they had to pick it from a list of what they
        hold — so there is nothing to conceal, and "you did not have it then" is
        the sentence that actually tells them what to do.
      */
      throw new ForbiddenException('You did not have this on that date');
    }
    return asset;
  }
}

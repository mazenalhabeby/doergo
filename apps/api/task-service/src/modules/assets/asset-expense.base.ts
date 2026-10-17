import { ApprovalRulesService } from '../../common/approval-rules/approval-rules.service';
import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Optional } from '@nestjs/common';
import { OBJECT_STORE, ObjectStore } from '@hbcfield/shared/storage';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AssetAccessService, type AssetActor } from './asset-access.service';
import { AssetNotifier } from './asset-notifier.service';
import { assetFilePrefix } from './asset-files';
import { CustodyReadService } from './custody-read.service';

/**
 * What filing and deciding an expense share: where a slip is kept, and the custody
 * gate on the receipt's date.
 */
@Injectable()
export abstract class AssetExpenseBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly access: AssetAccessService,
    protected readonly custodyRead: CustodyReadService,
    protected readonly notifier: AssetNotifier,
    @Inject(OBJECT_STORE) protected readonly store: ObjectStore | null,
    // Office rules (a threshold → a second approval). Global in the app; absent only in narrow unit tests.
    @Optional() protected readonly rules?: ApprovalRulesService,
  ) {}


  /** Everything a receipt for this asset lives under. Also the anti-IDOR check. */
  protected prefix(organizationId: string, assetId: string): string {
    return assetFilePrefix(organizationId, assetId);
  }

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
  protected async gate(data: { id: string } & AssetActor, when: Date) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true, name: true, category: { select: { config: true, spaceId: true } } },
    });
    if (!asset) throw new NotFoundException('Asset not found in this organization');
    const spaceId = asset.category?.spaceId ?? null;

    const mayLog = this.access.mayIn(data, 'log', spaceId);
    if (!mayLog && (data.isExternal === true || !(await this.custodyRead.heldBy(data.id, data.userId, when)))) {
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

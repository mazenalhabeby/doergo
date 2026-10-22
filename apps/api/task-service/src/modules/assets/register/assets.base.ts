import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService, peopleBriefWithEmail } from '@hbcfield/shared';
import { success, isAssetStatus, assetDateProblems, type AssetDateProblem } from '@hbcfield/shared';
import { AssetAccessService } from '../core/asset-access.service';
import { AssetHoldersService } from '../core/asset-holders.service';
import { AssetCustodyService } from '../custody/asset-custody.service';
import { AssetActivityService } from '../core/asset-activity.service';

/**
 * What the asset services share: holders on a record (one or many), the status and
 * date checks, and a kind's workspace.
 */
@Injectable()
export abstract class AssetsBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly access: AssetAccessService,
    protected readonly activity: AssetActivityService,
    protected readonly holderService: AssetHoldersService,
    protected readonly custody: AssetCustodyService,
  ) {}

  /**
   * Create a new asset
   */
  /**
   * Resolve who holds a record: a member, a client, or nobody.
   *
   * EITHER a member or a client, never both — the same rule an apartment's
   * resident follows. Picking one clears the other rather than rejecting the
   * request, because both arriving usually means the form sent a stale value,
   * and refusing would lose the edit the person actually made.
   *
   * The client is checked against THIS organization: a customer id is guessable,
   * and without this a record could be pinned to another tenant's customer.
   */
  /**
   * The holders on a record, with each member's name filled in.
   *
   * Members carry no foreign key (removing one must never be blocked by an
   * asset pointing at them), so they are looked up rather than joined — once
   * for the whole list, not once per holder. A member who has since been
   * removed resolves to null and simply drops out of the list rather than
   * leaving a row that renders as a blank name.
   */
  protected async withHoldersMany<
    T extends {
      id: string;
      organizationId: string;
      holders?: Array<{ id: string; userId: string | null; customerId: string | null; customer: unknown }>;
    },
  >(assets: T[], organizationId: string) {
    const userIds = [
      ...new Set(assets.flatMap((a) => (a.holders ?? []).map((h) => h.userId).filter((id): id is string => !!id))),
    ];
    const members = userIds.length ? await peopleBriefWithEmail(this.prisma, userIds, { organizationId }) : [];
    const byId = new Map(members.map((m) => [m.id, m]));

    return assets.map((a) => ({
      ...a,
      holders: (a.holders ?? [])
        .map((h) => ({
          id: h.id,
          userId: h.userId,
          customerId: h.customerId,
          user: h.userId ? (byId.get(h.userId) ?? null) : null,
          customer: h.customer ?? null,
        }))
        .filter((h) => h.user || h.customer),
    }));
  }

  protected async withHolders<T extends { id: string; organizationId: string }>(
    asset: T & { holders?: Array<{ id: string; userId: string | null; customerId: string | null; customer: unknown }> },
  ) {
    const rows = asset.holders ?? [];
    const userIds = rows.map((h) => h.userId).filter((id): id is string => !!id);

    const members = userIds.length
      ? await peopleBriefWithEmail(this.prisma, userIds, { organizationId: asset.organizationId })
      : [];
    const byId = new Map(members.map((m) => [m.id, m]));

    const holders = rows
      .map((h) => ({
        id: h.id,
        userId: h.userId,
        customerId: h.customerId,
        user: h.userId ? (byId.get(h.userId) ?? null) : null,
        customer: h.customer ?? null,
      }))
      .filter((h) => h.user || h.customer);

    return { ...asset, holders };
  }

  /**
   * Refuse a status that is not one of the four.
   *
   * The DTO validates it at the gateway, but the queue reaches this method with
   * whatever was put on the job, and `status as any` straight into Prisma turns
   * a typo into a 500 with an enum error in the log instead of a sentence.
   */
  protected assertStatus(status: unknown): void {
    if (status === undefined || status === null || status === '') return;
    if (!isAssetStatus(status)) throw new BadRequestException('That is not a status a record can have');
  }

  /**
   * Refuse dates that cannot both be true — asked of what the record WILL hold.
   *
   * A partial update may carry only the warranty; comparing it with nothing
   * would let a warranty ending before the install date through the second
   * time somebody edits the record.
   */
  protected assertDates(
    next: { installDate?: string | null; warrantyExpiry?: string | null },
    stored?: { installDate: Date | null; warrantyExpiry: Date | null },
  ): void {
    const problems = assetDateProblems({
      installDate: next.installDate !== undefined ? next.installDate : (stored?.installDate ?? null),
      warrantyExpiry: next.warrantyExpiry !== undefined ? next.warrantyExpiry : (stored?.warrantyExpiry ?? null),
    });
    if (!problems.length) return;
    const say: Record<AssetDateProblem, string> = {
      'install-invalid': 'That install date could not be read',
      'warranty-invalid': 'That warranty date could not be read',
      'warranty-before-install': 'The warranty cannot end before the date it was installed',
    };
    throw new BadRequestException(say[problems[0]!]);
  }

  /** The workspace an asset lives in (through its kind), or null. The space id only — no asset data. */
  async spaceOf(data: { id: string; organizationId: string }) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { category: { select: { spaceId: true } } },
    });
    return success({ spaceId: asset?.category?.spaceId ?? null });
  }
}

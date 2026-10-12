import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, normalizeKindShape, findMoneyCategory, clampListLimit } from '@hbcfield/shared';
import { AssetAccessService, type AssetActor } from './asset-access.service';
import { AssetExpenseService, EXPENSE_STATUS } from './asset-expense.service';
import { AssetLogService } from './asset-log.service';
import { readAssetEntryDate } from './asset-entry-date';

/**
 * Money logged against a record, and the totals over the whole ledger.
 */
@Injectable()
export class AssetLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
    private readonly expenses: AssetExpenseService,
    private readonly logs: AssetLogService,
  ) {}

  /**
   * The money logged against one asset, newest first, with the totals.
   *
   * Totals come from a groupBy over the WHOLE ledger, not from summing the page
   * — a total that only counted the rows currently on screen would be wrong the
   * moment there were more than a page of them, and wrong quietly.
   */
  async listMoney(data: {
    id: string;
    limit?: number;
  } & AssetActor) {
    await this.access.assetInScope(data.id, data, 'view');

    const take = clampListLimit(data.limit, 100, 200);

    const [entries, sums] = await Promise.all([
      this.prisma.assetMoney.findMany({
        // Money only. A logbook entry with no amount (a dent, a meter reading)
        // is on the Logbook, not in a ledger as a row reading €0.00.
        where: { assetId: data.id, amountCents: { gt: 0 } },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take,
      }),
      /*
        ⚠️ The totals count only what has been ACCEPTED.

        An expense sent from a phone is visible in the list from the moment it
        arrives — that is the point of sending it — but it is in no total until
        somebody with the register in their care says so. Summing everything
        would let anyone holding a van move the organization's figures by
        photographing a slip, and would make a rejected expense go on counting.
      */
      this.prisma.assetMoney.groupBy({
        by: ['direction'],
        where: { assetId: data.id, status: EXPENSE_STATUS.RECORDED },
        _sum: { amountCents: true },
      }),
    ]);

    const totalFor = (direction: string) =>
      sums.find((s) => s.direction === direction)?._sum.amountCents ?? 0;
    const inCents = totalFor('IN');
    const outCents = totalFor('OUT');

    const waiting = entries.filter((e) => e.status === EXPENSE_STATUS.SUBMITTED);

    return success({
      // The receipt KEY never leaves the server — only whether there is one, so
      // the screen can offer to open it through the endpoint that mints a link.
      entries: entries.map(({ receiptKey, ...e }) => ({ ...e, hasReceipt: !!receiptKey })),
      totals: {
        inCents,
        outCents,
        netCents: inCents - outCents,
        // Shown beside the total rather than inside it: "€184 waiting" is the
        // sentence that gets a queue looked at.
        waitingCount: waiting.length,
        waitingCents: waiting.reduce((n, e) => n + (e.direction === 'IN' ? 0 : e.amountCents), 0),
      },
    });
  }

  /**
   * Log money against an asset.
   *
   * The category must be one its KIND declares. A free-text heading would split
   * a total between "Repairs" and "repair" and neither half would look wrong.
   * The label is then STORED, so renaming the category later leaves history
   * reading as it did at the time.
   */
  async addMoney(data: {
    id: string;
    category: string;
    amountCents: number;
    note?: string;
    occurredAt?: string;
  } & AssetActor) {
    /*
      A money row is RECORDED the moment it is written — it moves the books with
      no review — so it is management, in the record's own workspace. Logging
      a cost that waits for the office is the logbook's job, not this one.
    */
    await this.access.assetInScope(data.id, data, 'manage');

    const asset = await this.prisma.asset.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true, category: { select: { config: true } } },
    });
    if (!asset) throw new NotFoundException('Asset not found in this organization');

    const shape = normalizeKindShape(asset.category?.config);
    if (!shape.money.enabled) {
      throw new BadRequestException('This kind does not track money');
    }

    const category = findMoneyCategory(shape, data.category ?? '');
    if (!category) {
      throw new BadRequestException(`"${data.category}" is not a category on this kind`);
    }

    // Cents, and never negative — the direction decides the sign, so a negative
    // amount here would silently invert an entry.
    const amountCents = Math.abs(Math.round(Number(data.amountCents)));
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new BadRequestException('An amount is needed');
    }

    /*
      The same date rule as the logbook and a member's expense — this is the
      same row. The backdating exemption is ORG-WIDE `canManageAssets`, so a
      workspace manager gets the same 120-day window a member does.
    */
    const occurredAt = readAssetEntryDate(data.occurredAt, data);

    const entry = await this.prisma.assetMoney.create({
      data: {
        organizationId: data.organizationId,
        assetId: data.id,
        category: category.label,
        direction: category.direction === 'in' ? 'IN' : 'OUT',
        amountCents,
        note: data.note?.trim().slice(0, 500) || null,
        occurredAt,
        authorId: data.userId,
      },
    });

    return success(entry);
  }

  /** Remove one entry. Scoped to the asset, so an id alone is not enough. */
  async removeMoney(data: {
    id: string;
    entryId: string;
  } & AssetActor) {
    await this.access.assetInScope(data.id, data, 'manage');

    // Read the key BEFORE the row goes, or the object behind it is orphaned in
    // the bucket forever — a photograph of somebody's receipt that nothing
    // points at and no retention rule can find.
    const entry = await this.prisma.assetMoney.findFirst({
      where: { id: data.entryId, assetId: data.id, organizationId: data.organizationId },
      select: { id: true, receiptKey: true, logType: true, status: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');

    await this.prisma.assetMoney.delete({ where: { id: entry.id } });
    // A removed oil change moves the service interval back to the one before it.
    if (entry.logType && entry.status === EXPENSE_STATUS.RECORDED) await this.logs.recomputeAsset(data.id);
    void this.expenses.forgetReceipt(entry.receiptKey);

    return success({ id: data.entryId });
  }
}

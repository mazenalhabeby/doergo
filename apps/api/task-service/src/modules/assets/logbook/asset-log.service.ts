import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { AssetExpenseReviewService } from '../expenses/asset-expense-review.service';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { extensionForMime, requireObjectStore } from '@hbcfield/shared/storage';
import { success, findLogType, validateLogValues, findPrior, COST_LOG_KEY } from '@hbcfield/shared';
import { EXPENSE_STATUS } from '../expenses/asset-expense.service';
import { ASSET_FILE_MAX_BYTES, ASSET_FILE_MIMES, isAssetFileKey, assetFilePrefix } from '../core/asset-files';
import { readAssetEntryDate } from '../core/asset-entry-date';
import { Actor } from './asset-log-helpers';
import { AssetLogBase } from './asset-log.base';

/**
 * The logbook: what gets done to a thing, and when it is due again.
 *
 * ⚠️ AN ENTRY IS AN `AssetMoney` ROW — the ledger generalised, not a second
 * table. Every total, the expense queue, the receipt link, the custody
 * breakdown and the phone's receipt flow already read `asset_money`; a parallel
 * log table would have meant teaching all of them to read two tables and add
 * them up, and two totals of the same money are how figures come to disagree.
 * A Fuel entry is a row with an amount and an odometer; a Damage entry is a row
 * whose amount is 0 — and the money readers ask `amountCents > 0`.
 *
 * ⚠️ CREDITED TO WHO DID IT, AUTHORISED BY CUSTODY. The author is stored; the
 * holder never is (see custody.ts). A type marked "holder only" is refused to
 * anybody who did not hold the thing ON THE ENTRY'S DATE, exactly as an expense
 * is; `canManageAssets` in the record's workspace passes, because the office
 * types in what the garage sent. A type that is not holder-only may also be
 * logged by anybody holding `canLogAssets` in the record's workspace — the
 * colleague who noticed the dent.
 *
 * ⚠️ DERIVED STATE IS WRITTEN IN THE SAME TRANSACTION AS THE ENTRY. The latest
 * reading of each meter and where every due rule stands are stored on the asset
 * (`logState`, `logRemindAt`), so a record page reads one row and the daily
 * sweep asks an index. Recomputed on create, accept, refuse and delete — every
 * way the set of RECORDED entries can change.
 */
@Injectable()
export class AssetLogService extends AssetLogBase {
  @Inject(AssetExpenseReviewService) private readonly expenseReviews!: AssetExpenseReviewService;


  // ── The photograph ─────────────────────────────────────────────────────────

  /**
   * A URL to put an entry's photo at — phone → S3 directly, under the asset's
   * prefix, gated exactly as filing the entry is. The expense route cannot
   * serve this: it asks custody for every type, and a colleague reporting a
   * dent is not the driver.
   */
  async presign(data: Actor & { id: string; logType?: string | null; fileName: string; mimeType: string; occurredAt?: string }) {
    const when = readAssetEntryDate(data.occurredAt, data);
    const asset = await this.loadAsset(data.id, data.organizationId);
    const type = findLogType(asset.shape, data.logType);
    if (!type) throw new BadRequestException('That is not something this kind logs');
    if (!type.fields.some((f) => f.type === 'photo')) throw new BadRequestException('This log takes no photo');
    await this.assertMayLog(data, asset, type.holderOnly, when);

    if (!ASSET_FILE_MIMES.includes(data.mimeType)) throw new BadRequestException('That kind of file cannot be attached');
    if (!data.fileName || data.fileName.length > 255) throw new BadRequestException('Invalid file name');

    // Never the client's filename: this becomes an object key.
    const key = `${assetFilePrefix(data.organizationId, data.id)}${randomUUID()}.${extensionForMime(data.mimeType)}`;
    const upload = await requireObjectStore(this.store).presignUpload(key, data.mimeType, undefined, 900);
    return success({ uploadUrl: upload.url, fileKey: key, expiresIn: 900, maxFileSize: ASSET_FILE_MAX_BYTES });
  }

  // ── Filing an entry ────────────────────────────────────────────────────────

  async create(
    data: Actor & {
      id: string;
      logType?: string | null;
      values?: unknown;
      note?: string;
      occurredAt?: string;
      receiptKey?: string;
      receiptName?: string;
      receiptMime?: string;
      /** Made on the phone: an entry filed twice is one entry. */
      entryId?: string;
    },
  ) {
    const when = readAssetEntryDate(data.occurredAt, data);
    const asset = await this.loadAsset(data.id, data.organizationId);
    const type = findLogType(asset.shape, data.logType);
    if (!type) throw new BadRequestException('That is not something this kind logs');

    await this.assertMayLog(data, asset, type.holderOnly, when);

    // Filed already — after the gate, so a guessed id reveals nothing.
    const prior = await findPrior({
      id: data.entryId,
      find: (id) => this.prisma.assetMoney.findUnique({ where: { id } }),
      isSame: (m) => m.authorId === data.userId && m.assetId === data.id,
    });
    if (prior) return success(this.present(prior));

    let receiptKey: string | null = null;
    if (data.receiptKey) {
      if (!type.fields.some((f) => f.type === 'photo')) throw new BadRequestException('This log takes no photo');
      if (!isAssetFileKey(data.receiptKey, data.organizationId, data.id)) throw new BadRequestException('Invalid file');
      const object = await requireObjectStore(this.store).head(data.receiptKey);
      if (!object.exists) throw new BadRequestException('The photo upload did not finish — please try again');
      if (object.sizeBytes <= 0 || object.sizeBytes > ASSET_FILE_MAX_BYTES) throw new BadRequestException('That file is too large');
      receiptKey = data.receiptKey;
    }

    const checked = validateLogValues(type, data.values, { hasPhoto: !!receiptKey, shape: asset.shape });
    if (!checked.ok) {
      throw new BadRequestException({ message: 'Some answers need another look', code: 'LOG_VALUES', problems: checked.problems });
    }

    /*
      Waits for the office when the TYPE says so and the author is not the
      office. Same reason the expense flow has: somebody holding a van must not
      be able to move the organization's figures — or reset a service interval
      — by photographing something.
    */
    const status = type.needsApproval && !this.access.mayIn(data, 'manage', asset.spaceId)
      ? EXPENSE_STATUS.SUBMITTED
      : EXPENSE_STATUS.RECORDED;
    const isCost = type.key === COST_LOG_KEY;

    const entry = await this.prisma.$transaction(async (tx) => {
      const row = await tx.assetMoney.create({
        data: {
          ...(data.entryId ? { id: data.entryId } : {}),
          organizationId: data.organizationId,
          assetId: data.id,
          // NULL is the Cost log, as every entry before the logbook was.
          logType: isCost ? null : type.key,
          category: checked.category.slice(0, 120),
          direction: checked.direction,
          amountCents: checked.amountCents,
          values: Object.keys(checked.values).length ? (checked.values as Prisma.InputJsonValue) : Prisma.DbNull,
          readings: Object.keys(checked.readings).length ? (checked.readings as Prisma.InputJsonValue) : Prisma.DbNull,
          note: data.note?.trim().slice(0, 500) || null,
          occurredAt: when,
          authorId: data.userId,
          receiptKey,
          receiptName: receiptKey ? data.receiptName?.slice(0, 255) ?? null : null,
          receiptMime: receiptKey ? data.receiptMime ?? null : null,
          status,
        },
      });
      // Only a RECORDED entry can move a reading or a due date.
      if (status === EXPENSE_STATUS.RECORDED) await this.recompute(tx, data.id, asset.shape);
      return row;
    });

    return success(this.present(entry));
  }

  // ── Decisions and removal ──────────────────────────────────────────────────

  /**
   * Accept or refuse — the existing expense decision, followed by the recompute
   * it never needed before: an accepted oil change resets a service interval.
   */
  async review(data: Actor & { entryId: string; decision: 'accept' | 'reject'; note?: string }) {
    const result = await this.expenseReviews.review(data);
    const entry = await this.prisma.assetMoney.findFirst({
      where: { id: data.entryId, organizationId: data.organizationId },
      select: { assetId: true, logType: true },
    });
    // A cost moves no reading and no due date; only a log entry does.
    if (entry?.logType) await this.recomputeAsset(entry.assetId);
    return result;
  }

  /**
   * Remove an entry. The office may remove any; an author may withdraw their
   * own while it is still waiting — once accepted it is the organization's
   * record, and only the office changes that.
   */
  async remove(data: Actor & { id: string; entryId: string }) {
    const entry = await this.prisma.assetMoney.findFirst({
      where: { id: data.entryId, assetId: data.id, organizationId: data.organizationId },
      select: {
        id: true, assetId: true, authorId: true, status: true, receiptKey: true, logType: true,
        asset: { select: { category: { select: { spaceId: true } } } },
      },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    const ownWaiting = entry.authorId === data.userId && entry.status === EXPENSE_STATUS.SUBMITTED;
    // "The office" is whoever manages THIS record's workspace.
    const office = this.access.mayIn(data, 'manage', entry.asset?.category?.spaceId ?? null);
    if (!office && !ownWaiting) throw new ForbiddenException('Only the office can remove this entry');

    await this.prisma.$transaction(async (tx) => {
      await tx.assetMoney.delete({ where: { id: entry.id } });
      if (entry.logType && entry.status === EXPENSE_STATUS.RECORDED) await this.recompute(tx, entry.assetId);
    });
    void this.expenses.forgetReceipt(entry.receiptKey);
    return success({ id: entry.id });
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  /**
   * Every record of a kind, after its rules changed. One asset at a time and
   * best effort: a failure on one is logged and the rest carry on, and the next
   * entry on any of them recomputes it anyway.
   */
  async recomputeKind(categoryId: string): Promise<number> {
    const assets = await this.prisma.asset.findMany({ where: { categoryId }, select: { id: true }, take: 5000 });
    let done = 0;
    for (const a of assets) {
      try {
        await this.recomputeAsset(a.id);
        done++;
      } catch (e) {
        this.logger.warn(`logbook recompute for ${a.id} failed: ${(e as Error).message}`);
      }
    }
    return done;
  }
}

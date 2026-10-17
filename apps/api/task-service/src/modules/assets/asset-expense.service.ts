import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { extensionForMime, requireObjectStore } from '@hbcfield/shared/storage';
import { pdfToLines } from './pdf-lines';
import { randomUUID } from 'crypto';
import { findPrior } from '../../common/create-once.util';
import { success, normalizeKindShape, findMoneyCategory, parseReceipt } from '@hbcfield/shared';
import { type AssetActor } from './asset-access.service';
import { readAssetEntryDate } from './asset-entry-date';
import { ALLOWED, MAX_FILE_SIZE, EXPENSE_STATUS } from './asset-expense-helpers';
import { AssetExpenseBase } from './asset-expense.base';

export { EXPENSE_STATUS } from './asset-expense-helpers';

/**
 * A member spends money on something they hold, and sends the slip.
 *
 * The whole point is that it happens AT THE PUMP. The realistic alternative is
 * a fistful of paper handed in at the end of the month and typed by somebody in
 * the office, which is why this path exists at all and why it asks for as
 * little as it does: a photograph, an amount, a heading.
 *
 * ⚠️ AUTHORIZATION IS CUSTODY, NOT A PERMISSION. A driver is not an asset
 * manager and never will be; requiring `canManageAssets` to file fuel would
 * make the feature unusable by the only people who need it. What they may file
 * against is exactly what they held ON THE DAY THE MONEY MOVED — asked of the
 * receipt's date, not of today, so yesterday's fuel can still be filed the
 * morning after the van goes back, and a receipt for a van they have never
 * driven cannot be filed at all.
 *
 * ⚠️ AND IT DOES NOT COUNT UNTIL THE OFFICE ACCEPTS IT. A submitted entry is
 * visible everywhere and is in NO total. The office decides what the books say
 * — the same rule as every other financial record in this product.
 */
@Injectable()
export class AssetExpenseService extends AssetExpenseBase {

  // ── The slip ───────────────────────────────────────────────────────────────

  /**
   * A URL to put the photograph at.
   *
   * Bytes go phone → S3 directly; nothing large passes through the API. The
   * object is presigned under a prefix that names the organization and the
   * asset, and the confirm step refuses anything outside it — which is what
   * stops a key from another tenant being attached to an entry here.
   */
  async presignReceipt(data: {
    id: string;
    fileName: string;
    mimeType: string;
    occurredAt?: string;
  } & AssetActor) {
    // The same date rule as a logbook entry — they are the same row.
    const when = readAssetEntryDate(data.occurredAt, data);
    await this.gate(data, when);

    if (!ALLOWED.includes(data.mimeType)) throw new BadRequestException('That kind of file is not a receipt');
    if (!data.fileName || data.fileName.length > 255) throw new BadRequestException('Invalid file name');

    // The name is never taken from the client: a filename is attacker-controlled
    // and this one becomes an object key.
    const key = `${this.prefix(data.organizationId, data.id)}${randomUUID()}.${extensionForMime(data.mimeType)}`;
    const upload = await requireObjectStore(this.store).presignUpload(key, data.mimeType, undefined, 900);
    return success({ uploadUrl: upload.url, fileKey: key, expiresIn: 900, maxFileSize: MAX_FILE_SIZE });
  }

  /**
   * Read a receipt the phone could not — a PDF.
   *
   * ⚠️ THE ONE FILE TYPE THE CAMERA PATH CAN NEVER OPEN. On-device OCR reads
   * pixels; a PDF has none until something renders it, and no phone build here
   * carries a renderer. Yet a PDF is what a supplier EMAILS, which makes it the
   * likeliest shape for exactly the invoices worth the most money.
   *
   * The text layer beats any OCR of the same page: those are the characters the
   * document was written with, not a guess at their shape. In a field where a
   * misread digit is money, that difference is the whole point.
   *
   * ⚠️ Same gate as filing one. Reading somebody's invoice tells you what they
   * spent and with whom — so the authorisation is custody on the receipt's own
   * date, exactly as `presignReceipt` and `submit` demand, and never a
   * permission a driver will never hold.
   *
   * Never throws for an unreadable file. A scanned PDF has no text layer and a
   * corrupt one has nothing at all; both come back `read: false`, and the
   * person types the amount as they would have anyway.
   */
  async readReceipt(data: {
    id: string;
    fileKey: string;
    occurredAt?: string;
  } & AssetActor) {
    // The same date rule as a logbook entry — they are the same row.
    const when = readAssetEntryDate(data.occurredAt, data);
    await this.gate(data, when);

    /*
      The key must be one WE presigned, for THIS asset, in THIS organization —
      the same check `submit` makes. Without it the field is a reader for any
      object in the bucket whose key somebody can guess.
    */
    if (data.fileKey.includes('..') || !data.fileKey.startsWith(this.prefix(data.organizationId, data.id))) {
      throw new BadRequestException('That file does not belong to this asset');
    }
    if (!data.fileKey.endsWith('.pdf')) {
      // Images are read ON the phone, better and for free. Saying so beats
      // running a worse reader here and overwriting a good answer.
      return success({ read: false, reason: 'NOT_A_PDF' as const });
    }

    const store = requireObjectStore(this.store);
    // Size first: a PDF parser handed a 2 GB object is a memory problem, not a receipt.
    const object = await store.head(data.fileKey);
    if (!object.exists) throw new BadRequestException('The upload did not complete — please try again');
    if (object.sizeBytes > MAX_FILE_SIZE) throw new BadRequestException('That file is too large to be a receipt');
    let bytes: Buffer;
    try {
      bytes = await store.get(data.fileKey);
    } catch {
      throw new BadRequestException('The upload did not complete — please try again');
    }

    const lines = await pdfToLines(bytes);
    if (lines.length === 0) {
      /*
        A PDF that is a photocopy in a wrapper. Nothing was read, and inventing
        a total from nothing is the one outcome worse than an empty field.
      */
      return success({ read: false, reason: 'NO_TEXT_LAYER' as const });
    }

    // The same rules the phone runs on a photograph, from `packages/shared`.
    const receipt = parseReceipt(lines);
    return success({ read: true, receipt });
  }

  /**
   * A link to look at one, minted on demand and short-lived.
   *
   * ⚠️ No list ever returns a receipt URL. A URL stored or handed out in bulk
   * outlives the reason it was issued; minting one per request keeps looking at
   * a member's spending an act rather than a side effect of opening a page.
   */
  async receiptUrl(data: {
    entryId: string;
  } & AssetActor) {
    const entry = await this.prisma.assetMoney.findFirst({
      where: { id: data.entryId, organizationId: data.organizationId },
      select: {
        id: true, receiptKey: true, receiptMime: true, authorId: true,
        asset: { select: { category: { select: { spaceId: true } } } },
      },
    });
    if (!entry?.receiptKey) throw new NotFoundException('No receipt on that entry');
    /*
      The person who sent it, or somebody who may read THAT record's money —
      the same reach the Money tab listing it has. Asked of the record's own
      workspace, and refused with the same 404 as no receipt at all: another
      depot's slips are not this reader's to learn about.
    */
    if (entry.authorId !== data.userId && !this.access.mayIn(data, 'view', entry.asset?.category?.spaceId ?? null)) {
      throw new NotFoundException('No receipt on that entry');
    }
    const url = await requireObjectStore(this.store).presignDownload(entry.receiptKey, undefined, 600, {
      // A photograph or a PDF renders; anything else was never accepted.
      inline: !!entry.receiptMime && ALLOWED.includes(entry.receiptMime),
      contentType: entry.receiptMime ?? undefined,
    });
    return success({ url, expiresIn: 600, mimeType: entry.receiptMime });
  }

  // ── Filing it ──────────────────────────────────────────────────────────────

  async submit(data: {
    id: string;
    category: string;
    amountCents: number;
    note?: string;
    occurredAt?: string;
    receiptKey?: string;
    receiptName?: string;
    receiptMime?: string;
    /** Made on the phone: an expense filed twice is one expense. */
    entryId?: string;
  } & AssetActor) {
    // The same date rule as a logbook entry — they are the same row.
    const when = readAssetEntryDate(data.occurredAt, data);
    const asset = await this.gate(data, when);

    // Filed already (after the custody gate, so a guessed id reveals nothing).
    const prior = await findPrior({
      id: data.entryId,
      find: (id) => this.prisma.assetMoney.findUnique({ where: { id } }),
      isSame: (m) => m.authorId === data.userId && m.assetId === data.id,
    });
    if (prior) return success(prior);

    const shape = normalizeKindShape(asset.category?.config);
    if (!shape.money.enabled) throw new BadRequestException('This kind does not track money');

    const category = findMoneyCategory(shape, data.category ?? '');
    if (!category) throw new BadRequestException(`"${data.category}" is not a category on this kind`);

    const amountCents = Math.abs(Math.round(Number(data.amountCents)));
    if (!Number.isFinite(amountCents) || amountCents <= 0) throw new BadRequestException('An amount is needed');

    // The key must be one WE presigned, for THIS asset, in THIS organization.
    // Anything else is a key from somewhere the caller should not be reading.
    let receiptKey: string | null = null;
    if (data.receiptKey) {
      if (data.receiptKey.includes('..') || !data.receiptKey.startsWith(this.prefix(data.organizationId, data.id))) {
        throw new BadRequestException('Invalid receipt');
      }
      // The slip must actually be there, and be a slip-sized file.
      const object = await requireObjectStore(this.store).head(data.receiptKey);
      if (!object.exists) throw new BadRequestException('The receipt upload did not finish — please try again');
      if (object.sizeBytes <= 0 || object.sizeBytes > MAX_FILE_SIZE) throw new BadRequestException('That receipt file is too large');
      receiptKey = data.receiptKey;
    }

    const entry = await this.prisma.assetMoney.create({
      data: {
        ...(data.entryId ? { id: data.entryId } : {}),
        organizationId: data.organizationId,
        assetId: data.id,
        category: category.label,
        direction: category.direction === 'in' ? 'IN' : 'OUT',
        amountCents,
        note: data.note?.trim().slice(0, 500) || null,
        occurredAt: when,
        authorId: data.userId,
        receiptKey,
        receiptName: receiptKey ? data.receiptName?.slice(0, 255) ?? null : null,
        receiptMime: receiptKey ? data.receiptMime ?? null : null,
        /*
          Somebody who manages THIS record's register is the office. Their
          entry counts immediately — asking them to approve their own typing
          would be a queue of one item that only ever says yes. Logging rights
          alone are not the office: a `canLogAssets` member's expense waits like
          any driver's, because it moves the organization's figures.
        */
        status: this.access.mayIn(data, 'manage', asset.category?.spaceId ?? null)
          ? EXPENSE_STATUS.RECORDED
          : EXPENSE_STATUS.SUBMITTED,
      },
    });

    // Only what is waiting on somebody. The office's own entry asks nobody.
    // (A replayed filing returned `prior` above and announces nothing twice.)
    if (entry.status === EXPENSE_STATUS.SUBMITTED) {
      await this.notifier.expenseSubmitted(entry);
    }

    return success(entry);
  }

  /** Remove the object behind a deleted entry. Best effort, never blocking. */
  async forgetReceipt(key: string | null | undefined): Promise<void> {
    if (!key || !this.store) return;
    if (!(await this.store.delete(key))) this.logger.warn(`Could not remove receipt ${key}`);
  }
}

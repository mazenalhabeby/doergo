import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OBJECT_STORE, ObjectStore, extensionForMime, requireObjectStore } from '@hbcfield/shared/storage';
import { pdfToLines } from './pdf-lines';
import { randomUUID } from 'crypto';
import { findPrior } from '../../common/create-once.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, normalizeKindShape, findMoneyCategory, parseReceipt } from '@hbcfield/shared';
import { AssetAccessService } from './asset-access.service';
import { AssetCustodyService } from './asset-custody.service';
import { ASSET_FILE_MIMES, ASSET_FILE_MAX_BYTES, assetFilePrefix } from './asset-files';

/** A receipt is a photograph or a PDF — the one definition, shared with the logbook. */
const ALLOWED = ASSET_FILE_MIMES;
const MAX_FILE_SIZE = ASSET_FILE_MAX_BYTES;
/** A receipt older than this is not a field expense, it is bookkeeping. */
const MAX_BACKDATE_DAYS = 120;

export const EXPENSE_STATUS = { SUBMITTED: 'SUBMITTED', RECORDED: 'RECORDED', REJECTED: 'REJECTED' } as const;

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
export class AssetExpenseService {
  private readonly logger = new Logger(AssetExpenseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
    private readonly custody: AssetCustodyService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
  ) {}

  /** Everything a receipt for this asset lives under. Also the anti-IDOR check. */
  private prefix(organizationId: string, assetId: string): string {
    return assetFilePrefix(organizationId, assetId);
  }

  /**
   * A date the money could plausibly have moved.
   *
   * Bounded on both sides. The future is refused outright — a receipt is proof
   * of something that has happened — and the past is bounded because a slip
   * from two years ago belongs in the office's books, not filed from a phone
   * against a custody nobody can now remember.
   */
  private readDate(raw: string | undefined, now = new Date()): Date {
    const at = raw ? new Date(raw) : now;
    if (Number.isNaN(at.getTime())) throw new BadRequestException('That date could not be read');
    if (at.getTime() > now.getTime() + 86_400_000) {
      throw new BadRequestException('A receipt cannot be dated in the future');
    }
    if (now.getTime() - at.getTime() > MAX_BACKDATE_DAYS * 86_400_000) {
      throw new BadRequestException(`A receipt older than ${MAX_BACKDATE_DAYS} days has to be filed by the office`);
    }
    return at;
  }

  /**
   * May this person file against this asset, for this date?
   *
   * Held it then, or manages assets. Returns the asset's kind, because every
   * caller needs it next and reading it twice is a second round trip on a path
   * that runs at a petrol pump on one bar of signal.
   */
  private async gate(data: {
    id: string;
    organizationId: string;
    userId: string;
    canManageAssets?: boolean;
  }, when: Date) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true, name: true, category: { select: { config: true } } },
    });
    if (!asset) throw new NotFoundException('Asset not found in this organization');

    if (!data.canManageAssets && !(await this.custody.heldBy(data.id, data.userId, when))) {
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
    userId: string;
    userRole: string;
    organizationId: string;
    canManageAssets?: boolean;
  }) {
    const when = this.readDate(data.occurredAt);
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
    userId: string;
    userRole: string;
    organizationId: string;
    canManageAssets?: boolean;
  }) {
    const when = this.readDate(data.occurredAt);
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
    userId: string;
    userRole: string;
    organizationId: string;
    canManageAssets?: boolean;
  }) {
    const entry = await this.prisma.assetMoney.findFirst({
      where: { id: data.entryId, organizationId: data.organizationId },
      select: { id: true, receiptKey: true, receiptMime: true, authorId: true },
    });
    if (!entry?.receiptKey) throw new NotFoundException('No receipt on that entry');
    // The person who sent it, or somebody who may manage the register.
    if (entry.authorId !== data.userId && !data.canManageAssets) {
      this.access.assertMay(data as any, 'view assets');
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
    userId: string;
    userRole: string;
    organizationId: string;
    canManageAssets?: boolean;
    /** Made on the phone: an expense filed twice is one expense. */
    entryId?: string;
  }) {
    const when = this.readDate(data.occurredAt);
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
          Somebody who manages the register is the office. Their entry counts
          immediately — asking them to approve their own typing would be a
          queue of one item that only ever says yes, and it would make the
          existing "log money" button behave differently for no reason.
        */
        status: data.canManageAssets ? EXPENSE_STATUS.RECORDED : EXPENSE_STATUS.SUBMITTED,
      },
    });

    return success(entry);
  }

  /** What the caller has sent in, newest first — the phone's "my expenses". */
  async mine(data: { userId: string; organizationId: string; limit?: number }) {
    const take = Math.min(Math.max(data.limit ?? 50, 1), 100);
    const entries = await this.prisma.assetMoney.findMany({
      /*
        Money only. Logbook entries share the table, and an app built before the
        logbook renders every row here as an amount — a dent would read €0.00.
        The phone's logbook reads `/assets/log/mine` for the rest.
      */
      where: { organizationId: data.organizationId, authorId: data.userId, amountCents: { gt: 0 } },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take,
      select: {
        id: true, assetId: true, category: true, direction: true, amountCents: true, note: true,
        occurredAt: true, status: true, reviewNote: true, reviewedAt: true, receiptKey: true,
        // Logbook entries share the table; the screen names their type (null = a cost).
        logType: true,
        asset: { select: { id: true, name: true } },
      },
    });
    // The KEY is never sent to a client — only whether there is one, so the
    // screen can offer to open it through the endpoint that mints a link.
    return success(entries.map(({ receiptKey, ...e }) => ({ ...e, hasReceipt: !!receiptKey })));
  }

  // ── The office's queue ─────────────────────────────────────────────────────

  /** Everything waiting on a decision. */
  async pending(data: { userId: string; userRole: string; organizationId: string; limit?: number }) {
    this.access.assertMay(data as any, 'view assets');
    const take = Math.min(Math.max(data.limit ?? 100, 1), 200);

    const entries = await this.prisma.assetMoney.findMany({
      where: { organizationId: data.organizationId, status: EXPENSE_STATUS.SUBMITTED },
      orderBy: [{ occurredAt: 'desc' }],
      take,
      select: {
        id: true, assetId: true, category: true, direction: true, amountCents: true, note: true,
        occurredAt: true, authorId: true, receiptKey: true, createdAt: true,
        // A logbook entry waiting for a decision is in the same queue; the screen names its type.
        logType: true, values: true,
        asset: { select: { id: true, name: true } },
      },
    });
    if (entries.length === 0) return success({ entries: [], totalCents: 0 });

    const authorIds = [...new Set(entries.map((e) => e.authorId).filter((v): v is string => !!v))];
    const authors = authorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: authorIds }, organizationId: data.organizationId },
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        })
      : [];
    const byId = new Map(authors.map((a) => [a.id, a]));

    return success({
      entries: entries.map(({ receiptKey, ...e }) => ({
        ...e,
        hasReceipt: !!receiptKey,
        author: e.authorId ? byId.get(e.authorId) ?? null : null,
      })),
      totalCents: entries.reduce((n, e) => n + (e.direction === 'IN' ? 0 : e.amountCents), 0),
    });
  }

  /**
   * Accept it, or refuse it with a reason.
   *
   * Only ever moves a SUBMITTED entry, and the `where` says so rather than a
   * read-then-write: two people opening the queue at once would otherwise both
   * see it pending and the second decision would silently overwrite the first.
   */
  async review(data: {
    entryId: string;
    decision: 'accept' | 'reject';
    note?: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'update assets');

    const { count } = await this.prisma.assetMoney.updateMany({
      where: {
        id: data.entryId,
        organizationId: data.organizationId,
        status: EXPENSE_STATUS.SUBMITTED,
      },
      data: {
        status: data.decision === 'accept' ? EXPENSE_STATUS.RECORDED : EXPENSE_STATUS.REJECTED,
        reviewedById: data.userId,
        reviewedAt: new Date(),
        reviewNote: data.note?.trim().slice(0, 300) || null,
      },
    });
    if (!count) throw new NotFoundException('That expense is not waiting for a decision');

    return success({ id: data.entryId, status: data.decision === 'accept' ? EXPENSE_STATUS.RECORDED : EXPENSE_STATUS.REJECTED });
  }

  /** Remove the object behind a deleted entry. Best effort, never blocking. */
  async forgetReceipt(key: string | null | undefined): Promise<void> {
    if (!key || !this.store) return;
    if (!(await this.store.delete(key))) this.logger.warn(`Could not remove receipt ${key}`);
  }
}

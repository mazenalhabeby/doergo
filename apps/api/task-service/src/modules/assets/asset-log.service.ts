import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { OBJECT_STORE, ObjectStore, extensionForMime, requireObjectStore } from '@hbcfield/shared/storage';
import {
  success,
  normalizeKindShape,
  findLogType,
  logTypesForKind,
  validateLogValues,
  latestReadings,
  computeNextDue,
  dueStatus,
  remindAtAfterWrite,
  readLogState,
  creditsByAuthor,
  creditsByLogType,
  findPrior,
  COST_LOG_KEY,
  type AssetLogState,
  type KindShape,
  type LogDueState,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AssetAccessService } from './asset-access.service';
import { AssetCustodyService } from './asset-custody.service';
import { AssetExpenseService, EXPENSE_STATUS } from './asset-expense.service';
import { ASSET_FILE_MAX_BYTES, ASSET_FILE_MIMES, isAssetFileKey, assetFilePrefix } from './asset-files';

/**
 * A member's day-to-day backdating window. The office may record history from
 * further back — last year's service, typed in the day the logbook is switched
 * on — which is exactly what makes the due dates right from the start.
 */
const MAX_MEMBER_BACKDATE_DAYS = 120;

/**
 * How many reading-carrying entries the recompute reads to find each meter's
 * latest value. Newest first, so the latest of every meter written in the last
 * 200 readings is exact; a meter nobody has read in 200 entries keeps nothing
 * rather than a stale value — and 200 readings is years of fuel slips.
 */
const READINGS_WINDOW = 200;

type Db = PrismaService | Prisma.TransactionClient;

interface Actor {
  userId: string;
  userRole: string;
  organizationId: string;
  canManageAssets?: boolean;
  canViewAllTasks?: boolean;
  viewAllSpaceIds?: string[];
}

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
 * is; `canManageAssets` passes, because the office types in what the garage
 * sent. A type that is not holder-only may also be logged by anybody who can
 * see the asset — the colleague who noticed the dent.
 *
 * ⚠️ DERIVED STATE IS WRITTEN IN THE SAME TRANSACTION AS THE ENTRY. The latest
 * reading of each meter and where every due rule stands are stored on the asset
 * (`logState`, `logRemindAt`), so a record page reads one row and the daily
 * sweep asks an index. Recomputed on create, accept, refuse and delete — every
 * way the set of RECORDED entries can change.
 */
@Injectable()
export class AssetLogService {
  private readonly logger = new Logger(AssetLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
    private readonly custody: AssetCustodyService,
    private readonly expenses: AssetExpenseService,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
  ) {}

  // ── Shared checks ──────────────────────────────────────────────────────────

  private readDate(raw: string | undefined, actor: Actor, now = new Date()): Date {
    const at = raw ? new Date(raw) : now;
    if (Number.isNaN(at.getTime())) throw new BadRequestException('That date could not be read');
    // Something that happened. A reminder of the future is a due rule, not an entry.
    if (at.getTime() > now.getTime() + 86_400_000) throw new BadRequestException('An entry cannot be dated in the future');
    if (!actor.canManageAssets && now.getTime() - at.getTime() > MAX_MEMBER_BACKDATE_DAYS * 86_400_000) {
      throw new BadRequestException(`An entry older than ${MAX_MEMBER_BACKDATE_DAYS} days has to be filed by the office`);
    }
    return at;
  }

  private async loadAsset(id: string, organizationId: string) {
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
   * The `assertMay` door plus the workspace: a grant held in the depot opens
   * the depot's vans, not the Linz office's. `assetInOrg` alone checks the
   * organization, which is the gap a space-scoped reader would walk through.
   */
  private canSee(actor: Actor, spaceId: string | null): boolean {
    if (this.access.isOrgWide(actor)) return true;
    if (!spaceId) return false;
    return (actor.viewAllSpaceIds ?? []).includes(spaceId);
  }

  private assertSees(actor: Actor, spaceId: string | null): void {
    this.access.assertMay(actor, 'view assets');
    // 404-shaped: the asset exists, but not for this reader.
    if (!this.canSee(actor, spaceId)) throw new NotFoundException('Asset not found in this organization');
  }

  /**
   * May this person log this type against this asset, on this date?
   *
   * Managers always. A holder-only type: whoever held it then. Any other type:
   * whoever held it then, or whoever can see it.
   */
  private async assertMayLog(
    actor: Actor,
    asset: { id: string; spaceId: string | null },
    holderOnly: boolean,
    when: Date,
  ): Promise<void> {
    if (actor.canManageAssets) return;
    if (await this.custody.heldBy(asset.id, actor.userId, when)) return;
    if (!holderOnly && (this.access.isOrgWide(actor) || (actor.viewAllSpaceIds?.length ?? 0) > 0) && this.canSee(actor, asset.spaceId)) {
      return;
    }
    throw new ForbiddenException(holderOnly ? 'You did not have this on that date' : 'You cannot log against this');
  }

  // ── The photograph ─────────────────────────────────────────────────────────

  /**
   * A URL to put an entry's photo at — phone → S3 directly, under the asset's
   * prefix, gated exactly as filing the entry is. The expense route cannot
   * serve this: it asks custody for every type, and a colleague reporting a
   * dent is not the driver.
   */
  async presign(data: Actor & { id: string; logType?: string | null; fileName: string; mimeType: string; occurredAt?: string }) {
    const when = this.readDate(data.occurredAt, data);
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
    const when = this.readDate(data.occurredAt, data);
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
    const status = type.needsApproval && !data.canManageAssets ? EXPENSE_STATUS.SUBMITTED : EXPENSE_STATUS.RECORDED;
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

  // ── Reading it ─────────────────────────────────────────────────────────────

  /** The keys never leave the server — only whether there is a photo. */
  private present<T extends { receiptKey?: string | null; logType?: string | null }>(row: T) {
    const { receiptKey, ...rest } = row;
    return { ...rest, logType: row.logType ?? COST_LOG_KEY, hasReceipt: !!receiptKey };
  }

  /**
   * One asset's log, newest first, a page at a time.
   *
   * Keyset-paged on (occurredAt, id) rather than offset: the log grows at the
   * top while somebody reads it, and an offset page would repeat or skip rows.
   */
  async list(
    data: Actor & {
      id: string;
      logType?: string;
      authorId?: string;
      status?: string;
      cursor?: string;
      limit?: number;
    },
  ) {
    const asset = await this.loadAsset(data.id, data.organizationId);
    this.assertSees(data, asset.spaceId);
    const take = this.access.pageSize(data.limit, 50);

    const where: Prisma.AssetMoneyWhereInput = { assetId: data.id, organizationId: data.organizationId };
    if (data.logType) where.logType = data.logType === COST_LOG_KEY ? null : data.logType;
    if (data.authorId) where.authorId = data.authorId;
    if (data.status && Object.values(EXPENSE_STATUS).includes(data.status as never)) where.status = data.status;

    if (data.cursor) {
      const at = await this.prisma.assetMoney.findFirst({
        where: { id: data.cursor, assetId: data.id },
        select: { id: true, occurredAt: true },
      });
      if (at) {
        where.OR = [
          { occurredAt: { lt: at.occurredAt } },
          { occurredAt: at.occurredAt, id: { lt: at.id } },
        ];
      }
    }

    const rows = await this.prisma.assetMoney.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    const page = rows.slice(0, take);
    const authors = await this.names(page.map((r) => r.authorId), data.organizationId);

    return success({
      entries: page.map((r) => ({ ...this.present(r), author: r.authorId ? authors.get(r.authorId) ?? null : null })),
      nextCursor: rows.length > take ? page[page.length - 1]!.id : null,
    });
  }

  /**
   * The Logbook tab's head: latest readings, where each due rule stands, and
   * who spent what on which type in a period.
   *
   * The readings and due come from the stored state (one row); the period
   * totals from one narrow read of the period, split by the shared rules — the
   * same functions the phone and the browser would use.
   */
  async summary(data: Actor & { id: string; from?: string; to?: string }) {
    const asset = await this.loadAsset(data.id, data.organizationId);
    this.assertSees(data, asset.spaceId);

    const now = new Date();
    const from = data.from ? new Date(data.from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = data.to ? new Date(data.to) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
      throw new BadRequestException('That period could not be read');
    }
    // Bounded: the split is done in memory, and "all time" on a fleet is not one screen.
    if (to.getTime() - from.getTime() > 400 * 86_400_000) throw new BadRequestException('A period may be at most a year');

    const [row, inPeriod, waiting] = await Promise.all([
      this.prisma.asset.findUnique({ where: { id: data.id }, select: { logState: true } }),
      this.prisma.assetMoney.findMany({
        where: { assetId: data.id, status: EXPENSE_STATUS.RECORDED, occurredAt: { gte: from, lte: to } },
        select: { authorId: true, amountCents: true, direction: true, logType: true },
      }),
      this.prisma.assetMoney.count({ where: { assetId: data.id, status: EXPENSE_STATUS.SUBMITTED } }),
    ]);
    const state = readLogState(row?.logState);
    const types = logTypesForKind(asset.shape);

    const byAuthor = creditsByAuthor(inPeriod);
    const byType = creditsByLogType(inPeriod);
    const authors = await this.names([...byAuthor.keys()], data.organizationId);

    return success({
      period: { from: from.toISOString(), to: to.toISOString() },
      readings: state.readings,
      due: this.dueFor(state, asset.shape, now),
      waitingCount: waiting,
      byAuthor: [...byAuthor.entries()]
        .map(([authorId, c]) => ({ authorId: authorId || null, author: authorId ? authors.get(authorId) ?? null : null, ...c }))
        .sort((a, b) => b.outCents - a.outCents || b.entries - a.entries),
      byType: types
        .map((t) => ({ logType: t.key, label: t.label, color: t.color, ...(byType.get(t.key) ?? { inCents: 0, outCents: 0, netCents: 0, entries: 0 }) }))
        // A type the kind has since removed still has history, and it still counted.
        .concat(
          [...byType.entries()]
            .filter(([k]) => !types.some((t) => t.key === k))
            .map(([k, c]) => ({ logType: k, label: k, color: 'slate' as const, ...c })),
        ),
    });
  }

  /** Where each type stands NOW, from the stored state — for any screen. */
  private dueFor(state: AssetLogState, shape: KindShape, now: Date) {
    return state.due
      .map((s) => {
        const type = findLogType(shape, s.key);
        // A rule removed from the kind since the last write says nothing.
        if (!type?.due) return null;
        const reading = s.meterKey ? state.readings[s.meterKey]?.value ?? null : null;
        const unit = s.meterKey ? type.fields.find((f) => f.key === s.meterKey)?.unit ?? null : null;
        return { ...s, label: type.label, color: type.color, unit, reading, ...dueStatus(s, reading, now) };
      })
      .filter(<T>(v: T | null): v is T => v !== null);
  }

  /**
   * What is due soon on the things the CALLER holds — the phone's "due soon"
   * line. No permission: the filter (open custody naming the caller) is the
   * authorization, the same rule as `GET /assets/mine`.
   */
  async dueMine(data: { userId: string; organizationId: string }) {
    const held = await this.prisma.assetCustody.findMany({
      where: { userId: data.userId, organizationId: data.organizationId, endedAt: null },
      select: { assetId: true },
      take: 100,
    });
    if (held.length === 0) return success({ items: [] });
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: [...new Set(held.map((h) => h.assetId))] }, organizationId: data.organizationId },
      select: { id: true, name: true, logState: true, category: { select: { config: true } } },
    });
    const now = new Date();
    const items = assets.flatMap((a) =>
      this.dueFor(readLogState(a.logState), normalizeKindShape(a.category?.config), now)
        .filter((d) => d.stage !== 'ok')
        .map((d) => ({ assetId: a.id, assetName: a.name, ...d })),
    );
    items.sort((x, y) => (x.stage === y.stage ? (x.daysLeft ?? 1e9) - (y.daysLeft ?? 1e9) : x.stage === 'overdue' ? -1 : 1));
    return success({ items });
  }

  /** What the caller has logged, newest first, with what happened to it. */
  async mine(data: { userId: string; organizationId: string; assetId?: string; limit?: number }) {
    const take = Math.min(Math.max(Number(data.limit) || 50, 1), 100);
    const rows = await this.prisma.assetMoney.findMany({
      where: {
        organizationId: data.organizationId,
        authorId: data.userId,
        ...(data.assetId ? { assetId: data.assetId } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take,
      select: {
        id: true, assetId: true, logType: true, category: true, direction: true, amountCents: true, note: true,
        values: true, occurredAt: true, status: true, reviewNote: true, reviewedAt: true, receiptKey: true,
        asset: { select: { id: true, name: true } },
      },
    });
    return success(rows.map((r) => this.present(r)));
  }

  // ── Decisions and removal ──────────────────────────────────────────────────

  /**
   * Accept or refuse — the existing expense decision, followed by the recompute
   * it never needed before: an accepted oil change resets a service interval.
   */
  async review(data: Actor & { entryId: string; decision: 'accept' | 'reject'; note?: string }) {
    const result = await this.expenses.review(data);
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
      select: { id: true, assetId: true, authorId: true, status: true, receiptKey: true, logType: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    const ownWaiting = entry.authorId === data.userId && entry.status === EXPENSE_STATUS.SUBMITTED;
    if (!data.canManageAssets && !ownWaiting) throw new ForbiddenException('Only the office can remove this entry');

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

  /** Recompute outside a caller's transaction. */
  async recomputeAsset(assetId: string): Promise<void> {
    await this.prisma.$transaction((tx) => this.recompute(tx, assetId));
  }

  /**
   * The asset's latest readings and due states, from its RECORDED entries.
   *
   * A handful of indexed reads whatever the length of the log: one per type
   * with a due rule ("newest entry of this type", on assetId+logType+occurredAt)
   * and one bounded read of the newest reading-carrying entries.
   */
  async recompute(db: Db, assetId: string, knownShape?: KindShape, now = new Date()): Promise<AssetLogState> {
    let shape = knownShape;
    if (!shape) {
      const a = await db.asset.findUnique({ where: { id: assetId }, select: { category: { select: { config: true } } } });
      shape = normalizeKindShape(a?.category?.config);
    }
    const dueTypes = shape.logTypes.filter((t) => t.due);

    const [lasts, readingRows] = await Promise.all([
      Promise.all(
        dueTypes.map((t) =>
          db.assetMoney.findFirst({
            where: { assetId, logType: t.key, status: EXPENSE_STATUS.RECORDED },
            orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
            select: { id: true, occurredAt: true, readings: true },
          }),
        ),
      ),
      db.assetMoney.findMany({
        where: { assetId, status: EXPENSE_STATUS.RECORDED, readings: { not: Prisma.DbNull } },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: READINGS_WINDOW,
        select: { id: true, occurredAt: true, readings: true },
      }),
    ]);

    const readings = latestReadings(
      readingRows.map((r) => ({ id: r.id, occurredAt: r.occurredAt, readings: r.readings as Record<string, number> | null })),
    );
    const due = dueTypes
      .map((t, i) => {
        const last = lasts[i];
        return computeNextDue(t, last ? { id: last.id, occurredAt: last.occurredAt, readings: last.readings as Record<string, number> | null } : null);
      })
      .filter((s): s is LogDueState => s !== null);

    const state: AssetLogState = { readings, due, computedAt: now.toISOString() };
    await db.asset.update({
      where: { id: assetId },
      data: {
        logState: state as unknown as Prisma.InputJsonValue,
        logRemindAt: remindAtAfterWrite(due, readings, now),
      },
    });
    return state;
  }

  // ── Names ──────────────────────────────────────────────────────────────────

  private async names(ids: Array<string | null | undefined>, organizationId: string) {
    const unique = [...new Set(ids.filter((v): v is string => !!v))];
    const users = unique.length
      ? await this.prisma.user.findMany({
          where: { id: { in: unique }, organizationId },
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        })
      : [];
    return new Map(users.map((u) => [u.id, u]));
  }
}

import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OBJECT_STORE, ObjectStore } from '@hbcfield/shared/storage';
import {
  normalizeKindShape,
  findLogType,
  latestReadings,
  computeNextDue,
  dueStatus,
  remindAtAfterWrite,
  COST_LOG_KEY,
  type AssetLogState,
  type KindShape,
  type LogDueState,
  peopleFaces,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { AssetAccessService } from './asset-access.service';
import { AssetExpenseService, EXPENSE_STATUS } from './asset-expense.service';
import { CustodyReadService } from './custody-read.service';
import { READINGS_WINDOW, Db, Actor } from './asset-log-helpers';

/**
 * What every logbook path shares: loading the asset, who may see and who may log,
 * an entry as sent, names, what is due, and recomputing an asset's readings and
 * due dates.
 */
@Injectable()
export abstract class AssetLogBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly access: AssetAccessService,
    protected readonly custodyRead: CustodyReadService,
    protected readonly expenses: AssetExpenseService,
    @Inject(OBJECT_STORE) protected readonly store: ObjectStore | null,
  ) {}

  // ── Shared checks ──────────────────────────────────────────────────────────

  protected async loadAsset(id: string, organizationId: string) {
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
  protected assertSees(actor: Actor, spaceId: string | null): void {
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
  protected async assertMayLog(
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

  // ── Reading it ─────────────────────────────────────────────────────────────

  /** The keys never leave the server — only whether there is a photo. */
  protected present<T extends { receiptKey?: string | null; logType?: string | null }>(row: T) {
    const { receiptKey, ...rest } = row;
    return { ...rest, logType: row.logType ?? COST_LOG_KEY, hasReceipt: !!receiptKey };
  }

  /** Where each type stands NOW, from the stored state — for any screen. */
  protected dueFor(state: AssetLogState, shape: KindShape, now: Date) {
    return state.due
      .map((s) => {
        const type = findLogType(shape, s.key);
        // A rule removed from the kind since the last write says nothing.
        if (!type?.due) return null;
        const reading = s.meterKey ? (state.readings[s.meterKey]?.value ?? null) : null;
        const unit = s.meterKey ? (type.fields.find((f) => f.key === s.meterKey)?.unit ?? null) : null;
        return { ...s, label: type.label, color: type.color, unit, reading, ...dueStatus(s, reading, now) };
      })
      .filter(<T>(v: T | null): v is T => v !== null);
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
      const a = await db.asset.findUnique({
        where: { id: assetId },
        select: { category: { select: { config: true } } },
      });
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
      readingRows.map((r) => ({
        id: r.id,
        occurredAt: r.occurredAt,
        readings: r.readings as Record<string, number> | null,
      })),
    );
    const due = dueTypes
      .map((t, i) => {
        const last = lasts[i];
        return computeNextDue(
          t,
          last
            ? { id: last.id, occurredAt: last.occurredAt, readings: last.readings as Record<string, number> | null }
            : null,
        );
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

  protected async names(ids: Array<string | null | undefined>, organizationId: string) {
    const unique = [...new Set(ids.filter((v): v is string => !!v))];
    const users = unique.length ? await peopleFaces(this.prisma, unique, { organizationId }) : [];
    return new Map(users.map((u) => [u.id, u]));
  }
}

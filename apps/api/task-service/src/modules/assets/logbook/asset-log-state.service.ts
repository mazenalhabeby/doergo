import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  normalizeKindShape,
  latestReadings,
  computeNextDue,
  remindAtAfterWrite,
  type AssetLogState,
  type KindShape,
  type LogDueState,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { EXPENSE_STATUS } from '../expenses/asset-expense.service';
import { READINGS_WINDOW, Db } from './asset-log-helpers';

/**
 * An asset's DERIVED logbook state — its latest readings and where every due
 * rule stands — stored on the asset (`logState`, `logRemindAt`) so a record
 * page reads one row and the daily sweep asks an index.
 */
@Injectable()
export class AssetLogStateService {
  constructor(private readonly prisma: PrismaService) {}

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
}

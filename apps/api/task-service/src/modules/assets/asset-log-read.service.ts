import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  success,
  normalizeKindShape,
  logTypesForKind,
  readLogState,
  creditsByAuthor,
  creditsByLogType,
  COST_LOG_KEY,
  clampListLimit,
} from '@hbcfield/shared';
import { EXPENSE_STATUS } from './asset-expense.service';
import { Actor } from './asset-log-helpers';
import { AssetLogBase } from './asset-log.base';

/** Reading the logbook: an asset's entries, its summary, what is due for me, and what I logged. */
@Injectable()
export class AssetLogReadService extends AssetLogBase {

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
    const take = clampListLimit(data.limit, 50, 100);
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
}

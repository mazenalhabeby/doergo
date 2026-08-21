import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success } from '@hbcfield/shared';
import { AssetAccessService } from './asset-access.service';

/**
 * What happened to a record: notes people wrote, and events worth keeping.
 *
 * Owns logHolderChange, so the records service asks for an entry rather than
 * writing one itself — the same reason a ledger is not kept by the person
 * spending the money.
 */
@Injectable()
export class AssetActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
  ) {}

  /**
   * What happened to one asset, newest first.
   *
   * Authors are resolved in one query rather than per row — a timeline is the
   * screen most likely to grow long, and N+1 here would be felt.
   */
  async listActivities(data: {
    id: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'view assets');
    await this.access.assetInOrg(data.id, data.organizationId);

    const activities = await this.prisma.assetActivity.findMany({
      where: { assetId: data.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const authorIds = [...new Set(activities.map((a) => a.authorId).filter(Boolean))] as string[];
    const authors = authorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const byId = new Map(authors.map((a) => [a.id, a]));

    return success(activities.map((a) => ({ ...a, author: a.authorId ? byId.get(a.authorId) ?? null : null })));
  }

  /** Write a note against an asset. */
  async addActivity(data: {
    id: string;
    body: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'update assets');
    await this.access.assetInOrg(data.id, data.organizationId);

    const body = (data.body ?? '').trim();
    if (!body) throw new BadRequestException('A note needs something in it');

    const activity = await this.prisma.assetActivity.create({
      data: {
        organizationId: data.organizationId,
        assetId: data.id,
        type: 'NOTE',
        body: body.slice(0, 4000),
        authorId: data.userId,
      },
    });

    return success(activity);
  }

  /**
   * Record that an asset changed hands.
   *
   * Best effort: a timeline entry that fails must never fail the change it was
   * describing, or moving a van to a different driver would error after the
   * move had already been written.
   */
  async logHolderChange(
    assetId: string,
    organizationId: string,
    authorId: string,
    from: Array<{ userId: string | null; customerId: string | null }>,
    to: Array<{ userId: string | null; customerId: string | null }>,
  ) {
    // Compared as SETS, not as lists: reordering the same three residents is
    // not a change, and logging it as one would fill a timeline with noise the
    // first time anybody edited a record without touching who holds it.
    const key = (h: { userId: string | null; customerId: string | null }) =>
      h.userId ? `u:${h.userId}` : `c:${h.customerId}`;
    const a = [...new Set(from.map(key))].sort();
    const b = [...new Set(to.map(key))].sort();
    if (a.length === b.length && a.every((v, i) => v === b[i])) return;
    try {
      await this.prisma.assetActivity.create({
        data: {
          organizationId,
          assetId,
          type: 'HOLDER_CHANGED',
          authorId,
          metadata: { from, to } as unknown as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Deliberately swallowed — see above.
    }
  }
}

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Role } from '@hbcfield/shared';

/** Nobody may ask for more than this in one request, however they ask. */
const MAX_PAGE = 200;

/**
 * The rules every asset operation shares: who may act, how big a page may be,
 * and whether a record is this organization's.
 *
 * Injected rather than inherited. A base class would make every service a
 * subclass of the rules, which is neither true nor testable; a collaborator can
 * be swapped in a test and cannot be partially overridden by accident.
 */
@Injectable()
export class AssetAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Who may read, and who may change.
   *
   * This check was written out 25 times, each with its own message and its own
   * `as any` cast. Once is enough: a rule copied 25 times is a rule that will
   * eventually be copied wrong, and the cast hid that the caller's type never
   * admitted the flag it was reading.
   */
  assertMay(
    actor: { userRole: string; canViewAllTasks?: boolean },
    doing: string,
  ): void {
    if (actor.userRole === Role.ADMIN || actor.canViewAllTasks) return;
    throw new ForbiddenException(`You do not have permission to ${doing}`);
  }

  /**
   * A page size somebody actually gets.
   *
   * `limit || 20` honoured whatever arrived, so ?limit=100000 returned the
   * table. Clamped in the service rather than only at the edge, because the
   * queue path reaches these methods without passing a DTO.
   */
  pageSize(limit: unknown, fallback = 20): number {
    const n = Number(limit);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return Math.min(Math.floor(n), MAX_PAGE);
  }


  // ============================================
  // ASSET CATEGORIES
  // ============================================

  /**
   * Confirm an asset is this organization's before anything reads or writes it.
   *
   * Ids are guessable, so every activity call goes through here rather than
   * trusting the id in the URL. Returns the row, since callers need it anyway.
   */
  async assetInOrg(id: string, organizationId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, organizationId },
      select: { id: true, holderUserId: true, customerId: true, categoryId: true },
    });
    if (!asset) throw new NotFoundException('Asset not found in this organization');
    return asset;
  }
}

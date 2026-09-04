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
    actor: { userRole: string; canViewAllTasks?: boolean; viewAllSpaceIds?: string[] },
    doing: string,
  ): void {
    if (this.isOrgWide(actor)) return;
    /*
      A grant held in a SPACE counts too — for the spaces it covers.

      Assets belong to a workspace through their kind, and whoever runs that
      workspace runs its equipment. Reading the flat column alone refused them
      the list entirely, which is why the assets page could not be opened by the
      person standing next to the forklift. WHICH assets they then see is
      narrowed by `spaceFilter` below; this only decides that the door opens.
    */
    if ((actor.viewAllSpaceIds?.length ?? 0) > 0) return;
    throw new ForbiddenException(`You do not have permission to ${doing}`);
  }

  /** Everything, or only certain workspaces? */
  isOrgWide(actor: { userRole: string; canViewAllTasks?: boolean }): boolean {
    return actor.userRole === Role.ADMIN || actor.canViewAllTasks === true;
  }

  /**
   * The `category` clause that keeps a list inside the caller's workspaces.
   *
   * An asset reaches a workspace through its KIND (`AssetCategory.spaceId`), so
   * the filter goes there rather than on the asset. Returns undefined for an
   * org-wide caller — no clause, no cost — and for a space-scoped one an
   * explicitly requested workspace is INTERSECTED with what they hold rather
   * than replacing it, so `?spaceId=` can narrow their view and never widen it.
   */
  spaceFilter(
    actor: { userRole: string; canViewAllTasks?: boolean; viewAllSpaceIds?: string[] },
    requestedSpaceId?: string,
  ): { spaceId: string | { in: string[] } } | undefined {
    if (this.isOrgWide(actor)) {
      return requestedSpaceId ? { spaceId: requestedSpaceId } : undefined;
    }
    const held = actor.viewAllSpaceIds ?? [];
    const allowed = requestedSpaceId ? held.filter((id) => id === requestedSpaceId) : held;
    // Empty means "granted nowhere", and must match nothing rather than
    // everything — the distinction this codebase has been bitten by before.
    return { spaceId: { in: allowed } };
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

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { Role, type AssetAccessLevel } from '@hbcfield/shared';
import type { AssetActorMessage } from '@hbcfield/shared/microservices';

/** Nobody may ask for more than this in one request, however they ask. */
const MAX_PAGE = 200;

/**
 * Who is acting on the register, and in which workspaces — as the gateway's
 * `assetActor` builds it from the verified session.
 *
 * Each level is a workspace list with three states: `null` = org-wide, an
 * array = only those workspaces, `[]` = nowhere. ⚠️ A level that is MISSING is
 * read as nowhere, never as everywhere: a caller that forgot to forward it (a
 * new route, a queue job built by hand) must lose access, not gain the whole
 * organization's register. That is the opposite of what `undefined` used to
 * mean on the contract flow, and it is the safe one.
 */
export type AssetActor = AssetActorMessage;

const FIELD: Record<AssetAccessLevel, 'viewSpaceIds' | 'logSpaceIds' | 'manageSpaceIds'> = {
  view: 'viewSpaceIds',
  log: 'logSpaceIds',
  manage: 'manageSpaceIds',
};

const DOING: Record<AssetAccessLevel, string> = {
  view: 'view assets',
  log: 'log against assets',
  manage: 'manage assets',
};

/**
 * Where this caller may act at `level`: null = everywhere, [] = nowhere.
 *
 * An administrator is org-wide whatever was forwarded. Anything that is not
 * `null` or an array — absent, or a value nobody meant — is nowhere. A plain
 * function so a service that does not inject the access rules (the proposal
 * queue) asks the very same question.
 */
export function assetScope(actor: AssetActor, level: AssetAccessLevel): string[] | null {
  if (actor.userRole === Role.ADMIN) return null;
  const held = actor[FIELD[level]];
  if (held === null) return null;
  return Array.isArray(held) ? held : [];
}

/**
 * The rules every asset operation shares: who may act, where, how big a page
 * may be, and whether a record is reachable at all.
 *
 * Injected rather than inherited. A base class would make every service a
 * subclass of the rules, which is neither true nor testable; a collaborator can
 * be swapped in a test and cannot be partially overridden by accident.
 */
@Injectable()
export class AssetAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Where this caller may act at `level` — see `assetScope`. */
  scope(actor: AssetActor, level: AssetAccessLevel): string[] | null {
    return assetScope(actor, level);
  }

  /**
   * May they act at this level ANYWHERE? The door, not the room: WHICH
   * records they reach is decided by `spaceFilter` / `assetInScope`.
   */
  assertMay(actor: AssetActor, level: AssetAccessLevel, doing: string = DOING[level]): void {
    const scope = this.scope(actor, level);
    if (scope === null || scope.length > 0) return;
    throw new ForbiddenException(`You do not have permission to ${doing}`);
  }

  /**
   * May they act at this level on something in `spaceId`?
   *
   * `null` — a kind in no workspace, or a record with no kind — answers yes
   * only to an org-wide grant: it belongs to nobody's workspace, so no
   * workspace grant can reach it.
   */
  mayIn(actor: AssetActor, level: AssetAccessLevel, spaceId: string | null | undefined): boolean {
    const scope = this.scope(actor, level);
    if (scope === null) return true;
    return !!spaceId && scope.includes(spaceId);
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
    actor: AssetActor,
    level: AssetAccessLevel,
    requestedSpaceId?: string,
  ): { spaceId: string | { in: string[] } } | undefined {
    const scope = this.scope(actor, level);
    if (scope === null) {
      return requestedSpaceId ? { spaceId: requestedSpaceId } : undefined;
    }
    const allowed = requestedSpaceId ? scope.filter((id) => id === requestedSpaceId) : scope;
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

  /**
   * One asset, if this caller may act on it at `level` — else 404.
   *
   * Ids are guessable, so every per-record call comes through here rather than
   * trusting the id in the URL. The workspace is the KIND's, read here, never
   * anything the client sent.
   *
   * ⚠️ 404, and the same sentence as an asset in another organization or none
   * at all: "it exists, you just may not open it" would tell a depot what
   * another depot runs. Returns the row, since callers need it anyway.
   */
  async assetInScope(id: string, actor: AssetActor, level: AssetAccessLevel) {
    this.assertMay(actor, level);
    const asset = await this.prisma.asset.findFirst({
      where: { id, organizationId: actor.organizationId },
      select: {
        id: true,
        holderUserId: true,
        customerId: true,
        categoryId: true,
        category: { select: { spaceId: true } },
      },
    });
    const spaceId = asset?.category?.spaceId ?? null;
    if (!asset || !this.mayIn(actor, level, spaceId)) {
      throw new NotFoundException('Asset not found in this organization');
    }
    return { ...asset, spaceId };
  }

  /**
   * One kind, if this caller may act on it at `level` — else 404, exactly as a
   * record. A kind is configuration of ONE workspace's register.
   */
  async kindInScope(id: string, actor: AssetActor, level: AssetAccessLevel) {
    this.assertMay(actor, level);
    const kind = await this.prisma.assetCategory.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!kind || !this.mayIn(actor, level, kind.spaceId)) {
      throw new NotFoundException('Category not found');
    }
    return kind;
  }
}

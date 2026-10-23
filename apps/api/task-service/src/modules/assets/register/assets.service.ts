import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import {
  PrismaService,
  success,
  paginated,
  TaskStatus,
  SELECTABLE_ASSET_WHERE,
  assertFoundInOrg,
} from '@hbcfield/shared';
import { AssetAccessService, type AssetActor } from '../core/asset-access.service';
import { AssetHoldersService } from '../core/asset-holders.service';
import { withHolderNames, withHolderNamesMany } from './asset-record-rules';
import type { Prisma, AssetStatus } from '@prisma/client';

/**
 * The records themselves: the things an organization owns and who has them.
 *
 * Tables, money and activity moved out to services of their own; this one asks
 * them for what it needs. It kept the name so every existing import and message
 * pattern still resolves.
 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
  ) {}

  /** The workspace an asset lives in (through its kind), or null. The space id only — no asset data. */
  async spaceOf(data: { id: string; organizationId: string }) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { category: { select: { spaceId: true } } },
    });
    return success({ spaceId: asset?.category?.spaceId ?? null });
  }

  /**
   * Get all assets with filters
   */
  async findAll(
    query: {
      page?: number;
      limit?: number;
      categoryId?: string;
      typeId?: string;
      status?: string;
      /** Leave RETIRED out unless a status is asked for explicitly. */
      hideRetired?: boolean | string;
      search?: string;
      /** Narrow to one workspace — intersected with what the caller holds. */
      spaceId?: string;
    } & AssetActor,
  ) {
    this.access.assertMay(query, 'view');

    const page = Math.max(1, query.page || 1);
    const limit = this.access.pageSize(query.limit);
    const skip = (page - 1) * limit;

    const where: Prisma.AssetWhereInput = {
      organizationId: query.organizationId,
    };

    /*
      Which workspaces this list may show.

      Undefined for an org-wide caller with no workspace chosen, so their query
      is exactly what it was. A space-scoped one always gets a clause — see
      spaceFilter, which intersects rather than replaces.
    */
    const category = this.access.spaceFilter(query, 'view', query.spaceId);
    if (category) where.category = category;

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.typeId) where.typeId = query.typeId;
    if (query.status) where.status = query.status as AssetStatus;
    /*
      Retired records stay on the books and out of the way.

      Opt-in rather than a new default: every existing caller of this list was
      written against "everything", and changing what an endpoint returns under
      a caller that did not ask is how a screen quietly loses rows. An explicit
      `status` wins — asking for RETIRED has to return them.
    */
    else if (query.hideRetired === true || query.hideRetired === 'true') {
      Object.assign(where, SELECTABLE_ASSET_WHERE);
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { serialNumber: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
        { manufacturer: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [assets, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          // spaceId: the "All workspaces" list says which workspace each one is in.
          category: { select: { id: true, name: true, color: true, icon: true, spaceId: true } },
          type: { select: { id: true, name: true } },
          holders: { select: AssetHoldersService.select },
          _count: { select: { tasks: true } },
        },
      }),
      this.prisma.asset.count({ where }),
    ]);

    // One member lookup for the whole page, not one per row: a list is exactly
    // where an N+1 hides until the page it is on gets long.
    return paginated(await withHolderNamesMany(this.prisma, assets, query.organizationId), { page, limit, total });
  }

  /**
   * Assets that belong to no space, and so appear on no screen.
   *
   * A type carries the space; an asset reaches its space through its type. Rows
   * created before types were space-scoped — and any asset that lost its type
   * when one was deleted — therefore sit outside every space's Assets tab while
   * still being real records, still linked to tasks, and still counted on the
   * bill. Invisible and chargeable is the worst pair of properties a record can
   * have, so they are listed here to be moved into a space or deleted.
   *
   * Top-level only, exactly like the billing count: a part inside a machine is
   * reached through the machine, so moving the machine takes it with it.
   */
  async listOrphans(data: AssetActor) {
    /*
      ⚠️ Org-wide readers only. Every row here is in NO workspace, so no
      workspace grant reaches it — listing them to a depot manager would hand
      them records outside every scope, which is exactly what the rest of the
      register refuses.
    */
    if (this.access.scope(data, 'view') !== null) {
      throw new ForbiddenException('Only someone who sees every workspace’s assets can list these');
    }

    const assets = await this.prisma.asset.findMany({
      where: {
        organizationId: data.organizationId,
        OR: [{ categoryId: null }, { category: { spaceId: null } }],
      },
      // Capped rather than paged: this is a cleanup list that should end at
      // zero, and a page control on a list nobody wants to have is noise.
      take: 200,
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        status: true,
        serialNumber: true,
        createdAt: true,
        category: { select: { id: true, name: true } },
        type: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
    });

    return success(assets);
  }

  /**
   * Get a single asset by ID
   */
  async findOne(data: { id: string } & AssetActor) {
    // In the caller's workspaces, or 404 — the same answer as no such asset.
    await this.access.assetInScope(data.id, data, 'view');

    const asset = await this.prisma.asset.findUnique({
      where: { id: data.id },
      include: {
        // config comes with the category: the record page is drawn from the
        // kind's shape, and a second round trip for it would be visible.
        category: { select: { id: true, name: true, color: true, icon: true, config: true, spaceId: true } },
        type: { select: { id: true, name: true } },
        holders: { select: AssetHoldersService.select },
        _count: { select: { tasks: true } },
      },
    });

    assertFoundInOrg(asset, data.organizationId, 'Asset');

    return success(await withHolderNames(this.prisma, asset));
  }

  /**
   * Delete an asset
   */
  async delete(data: { id: string } & AssetActor) {
    await this.access.assetInScope(data.id, data, 'manage');

    const asset = await this.prisma.asset.findUnique({
      where: { id: data.id },
      include: { _count: { select: { tasks: true } } },
    });

    assertFoundInOrg(asset, data.organizationId, 'Asset');

    // An asset's VALUE is its history — the maintenance record attached to that
    // machine, vehicle or flat. Deleting one with work against it destroyed that
    // permanently and silently detached the tasks (audit AS-B1), while the product
    // already has the right answer for "this is out of service": status RETIRED,
    // which is exactly what BILLABLE_ASSET_WHERE excludes, so retiring it also
    // stops the billing. Mirrors the space purge rule: hard delete for empty
    // records only, everything else is deactivated.
    if (asset._count.tasks > 0) {
      throw new BadRequestException(
        `This asset has ${asset._count.tasks} job(s) in its history and cannot be deleted. ` +
          'Set its status to Retired instead — the record and its history stay, and it stops being billed.',
      );
    }

    await this.prisma.asset.delete({ where: { id: data.id } });

    return success(null, 'Asset deleted successfully');
  }

  /**
   * Get maintenance history for an asset (completed tasks)
   */
  async getMaintenanceHistory(
    data: {
      id: string;
      page?: number;
      limit?: number;
      /**
       * 'done' — finished work only, which is what a maintenance history means.
       * 'all'  — everything, including work still open. The record page wants
       *          this: somebody standing at the machine needs to know a job is
       *          already raised before raising a second one.
       */
      scope?: 'done' | 'all';
    } & AssetActor,
  ) {
    await this.access.assetInScope(data.id, data, 'view');

    const asset = await this.prisma.asset.findUnique({
      where: { id: data.id },
    });

    assertFoundInOrg(asset, data.organizationId, 'Asset');

    const page = Math.max(1, data.page || 1);
    const limit = this.access.pageSize(data.limit);
    const skip = (page - 1) * limit;

    const finishedOnly = data.scope !== 'all';
    const where = {
      assetId: data.id,
      ...(finishedOnly ? { status: { in: [TaskStatus.COMPLETED, TaskStatus.CLOSED] } } : {}),
    };

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    // Transform to maintenance history format
    const history = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      completedAt: task.updatedAt,
      duration:
        task.routeStartedAt && task.routeEndedAt
          ? Math.floor((task.routeEndedAt.getTime() - task.routeStartedAt.getTime()) / 1000)
          : null,
      assignedTo: task.assignedTo,
    }));

    return paginated(history, { page, limit, total });
  }
}

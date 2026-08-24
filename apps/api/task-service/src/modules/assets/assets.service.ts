import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Role, success, paginated, TaskStatus, normalizeDetailRows } from '@hbcfield/shared';
import { AssetAccessService } from './asset-access.service';
import { AssetHoldersService, type HolderInput } from './asset-holders.service';
import { AssetActivityService } from './asset-activity.service';

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
    private readonly activity: AssetActivityService,
    private readonly holderService: AssetHoldersService,
  ) {}

  /**
   * Create a new asset
   */
  /**
   * Resolve who holds a record: a member, a client, or nobody.
   *
   * EITHER a member or a client, never both — the same rule an apartment's
   * resident follows. Picking one clears the other rather than rejecting the
   * request, because both arriving usually means the form sent a stale value,
   * and refusing would lose the edit the person actually made.
   *
   * The client is checked against THIS organization: a customer id is guessable,
   * and without this a record could be pinned to another tenant's customer.
   */
  /**
   * The holders on a record, with each member's name filled in.
   *
   * Members carry no foreign key (removing one must never be blocked by an
   * asset pointing at them), so they are looked up rather than joined — once
   * for the whole list, not once per holder. A member who has since been
   * removed resolves to null and simply drops out of the list rather than
   * leaving a row that renders as a blank name.
   */
  private async withHoldersMany<T extends { id: string; organizationId: string; holders?: Array<{ id: string; userId: string | null; customerId: string | null; customer: unknown }> }>(
    assets: T[],
    organizationId: string,
  ) {
    const userIds = [
      ...new Set(assets.flatMap((a) => (a.holders ?? []).map((h) => h.userId).filter((id): id is string => !!id))),
    ];
    const members = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds }, organizationId },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const byId = new Map(members.map((m) => [m.id, m]));

    return assets.map((a) => ({
      ...a,
      holders: (a.holders ?? [])
        .map((h) => ({
          id: h.id,
          userId: h.userId,
          customerId: h.customerId,
          user: h.userId ? byId.get(h.userId) ?? null : null,
          customer: h.customer ?? null,
        }))
        .filter((h) => h.user || h.customer),
    }));
  }

  private async withHolders<T extends { id: string; organizationId: string }>(
    asset: T & { holders?: Array<{ id: string; userId: string | null; customerId: string | null; customer: unknown }> },
  ) {
    const rows = asset.holders ?? [];
    const userIds = rows.map((h) => h.userId).filter((id): id is string => !!id);

    const members = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds }, organizationId: asset.organizationId },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const byId = new Map(members.map((m) => [m.id, m]));

    const holders = rows
      .map((h) => ({
        id: h.id,
        userId: h.userId,
        customerId: h.customerId,
        user: h.userId ? byId.get(h.userId) ?? null : null,
        customer: h.customer ?? null,
      }))
      .filter((h) => h.user || h.customer);

    return { ...asset, holders };
  }

  async create(data: {
    name: string;
    serialNumber?: string;
    model?: string;
    manufacturer?: string;
    status?: string;
    installDate?: string;
    warrantyExpiry?: string;
    locationAddress?: string;
    locationLat?: number;
    locationLng?: number;
    notes?: string;
    categoryId?: string;
    typeId?: string;
    holderUserId?: string | null;
    customerId?: string | null;
    details?: unknown;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'create assets');

    // Verify category if provided. Its config comes back with it: the kind is
    // what decides how many holders a record may have, and asking for it twice
    // would be a second round trip for something already in hand.
    let kindConfig: unknown = null;
    if (data.categoryId) {
      const category = await this.prisma.assetCategory.findUnique({
        where: { id: data.categoryId },
        select: { organizationId: true, config: true },
      });

      if (!category || category.organizationId !== data.organizationId) {
        throw new BadRequestException('Invalid category');
      }
      kindConfig = category.config;
    }

    // Verify type if provided
    if (data.typeId) {
      const type = await this.prisma.assetType.findUnique({
        where: { id: data.typeId },
        include: { category: true },
      });

      if (!type || type.category.organizationId !== data.organizationId) {
        throw new BadRequestException('Invalid type');
      }

      // Ensure type belongs to the specified category
      if (data.categoryId && type.categoryId !== data.categoryId) {
        throw new BadRequestException('Type does not belong to the specified category');
      }
    }

    // Resolved BEFORE the write: a holder that is not this organization's must
    // stop the create, not leave a record behind with nobody on it.
    const holderRows = await this.holderService.resolve(
      AssetHoldersService.fromLegacy(data),
      data.organizationId,
      kindConfig,
    );

    const asset = await this.prisma.asset.create({
      data: {
        name: data.name,
        serialNumber: data.serialNumber,
        model: data.model,
        manufacturer: data.manufacturer,
        status: (data.status as any) || 'ACTIVE',
        installDate: data.installDate ? new Date(data.installDate) : null,
        warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
        locationAddress: data.locationAddress,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        notes: data.notes,
        categoryId: data.categoryId,
        typeId: data.typeId,
        organizationId: data.organizationId,
        details: normalizeDetailRows(data.details) as unknown as Prisma.InputJsonValue,
        // Written with the record: nested creates run inside Prisma's own
        // transaction, so a record never exists for an instant with the wrong
        // people on it.
        holders: holderRows.length ? { create: holderRows } : undefined,
      },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        type: { select: { id: true, name: true } },
        holders: { select: AssetHoldersService.select },
      },
    });

    return success(await this.withHolders(asset));
  }

  /**
   * Get all assets with filters
   */
  async findAll(query: {
    page?: number;
    limit?: number;
    categoryId?: string;
    typeId?: string;
    status?: string;
    search?: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(query as any, 'view assets');

    const page = Math.max(1, query.page || 1);
    const limit = this.access.pageSize(query.limit);
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: query.organizationId,
    };

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.typeId) where.typeId = query.typeId;
    if (query.status) where.status = query.status;
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
          category: { select: { id: true, name: true, color: true, icon: true } },
          type: { select: { id: true, name: true } },
          holders: { select: AssetHoldersService.select },
          _count: { select: { tasks: true } },
        },
      }),
      this.prisma.asset.count({ where }),
    ]);

    // One member lookup for the whole page, not one per row: a list is exactly
    // where an N+1 hides until the page it is on gets long.
    return paginated(await this.withHoldersMany(assets, query.organizationId), { page, limit, total });
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
  async listOrphans(data: { userId: string; userRole: string; organizationId: string; canViewAllTasks?: boolean }) {
    this.access.assertMay(data as any, 'view assets');

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
  async findOne(data: {
    id: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'view assets');

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

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.organizationId !== data.organizationId) {
      throw new ForbiddenException('Asset does not belong to your organization');
    }

    return success(await this.withHolders(asset));
  }

  /**
   * Update an asset
   */
  async update(data: {
    id: string;
    holderUserId?: string | null;
    customerId?: string | null;
    details?: unknown;
    name?: string;
    serialNumber?: string;
    model?: string;
    manufacturer?: string;
    status?: string;
    installDate?: string;
    warrantyExpiry?: string;
    locationAddress?: string;
    locationLat?: number;
    locationLng?: number;
    notes?: string;
    categoryId?: string;
    typeId?: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'update assets');

    const asset = await this.prisma.asset.findUnique({
      where: { id: data.id },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.organizationId !== data.organizationId) {
      throw new ForbiddenException('Asset does not belong to your organization');
    }

    // Verify category if changing
    if (data.categoryId !== undefined) {
      if (data.categoryId) {
        const category = await this.prisma.assetCategory.findUnique({
          where: { id: data.categoryId },
        });

        if (!category || category.organizationId !== data.organizationId) {
          throw new BadRequestException('Invalid category');
        }
      }
    }

    // Verify type if changing
    if (data.typeId !== undefined) {
      if (data.typeId) {
        const type = await this.prisma.assetType.findUnique({
          where: { id: data.typeId },
          include: { category: true },
        });

        if (!type || type.category.organizationId !== data.organizationId) {
          throw new BadRequestException('Invalid type');
        }
      }
    }

    /*
      Holders, resolved before the write.

      `fromLegacy` returns undefined when the request said nothing about them —
      which has to stay distinct from an empty list, or every partial update
      (renaming a flat, say) would silently clear its residents.

      The OLD set is read first so the timeline entry can say what changed from
      what. The kind that decides how many are allowed is the one the record
      will end up in, so a move into a single-holder type is checked against
      that type and not the one it is leaving.
    */
    const wanted: HolderInput[] | undefined = AssetHoldersService.fromLegacy(data);
    let holderRows: Array<{ userId: string | null; customerId: string | null }> | null = null;
    let before: Array<{ userId: string | null; customerId: string | null }> | null = null;

    if (wanted !== undefined) {
      const owner = await this.prisma.asset.findFirst({
        where: { id: data.id, organizationId: data.organizationId },
        select: {
          category: { select: { config: true } },
          holders: { select: { userId: true, customerId: true } },
        },
      });
      if (!owner) throw new NotFoundException('Asset not found in this organization');

      const kindConfig =
        data.categoryId !== undefined && data.categoryId
          ? (
              await this.prisma.assetCategory.findFirst({
                where: { id: data.categoryId, organizationId: data.organizationId },
                select: { config: true },
              })
            )?.config ?? null
          : owner.category?.config ?? null;

      holderRows = await this.holderService.resolve(wanted, data.organizationId, kindConfig);
      before = owner.holders;
    }

    const updated = await this.prisma.asset.update({
      where: { id: data.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.serialNumber !== undefined && { serialNumber: data.serialNumber }),
        ...(data.model !== undefined && { model: data.model }),
        ...(data.manufacturer !== undefined && { manufacturer: data.manufacturer }),
        ...(data.status && { status: data.status as any }),
        ...(data.installDate !== undefined && { installDate: data.installDate ? new Date(data.installDate) : null }),
        ...(data.warrantyExpiry !== undefined && { warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null }),
        ...(data.locationAddress !== undefined && { locationAddress: data.locationAddress }),
        ...(data.locationLat !== undefined && { locationLat: data.locationLat }),
        ...(data.locationLng !== undefined && { locationLng: data.locationLng }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.typeId !== undefined && { typeId: data.typeId }),
        // Holders are replaced as a SET: sending the list re-decides all of it,
        // so moving a thing from a member to a client clears the member in one
        // go and no stale row survives a change of mind.
        ...(holderRows
          ? { holders: { deleteMany: {}, ...(holderRows.length ? { create: holderRows } : {}) } }
          : {}),
        ...(data.details !== undefined && {
          details: normalizeDetailRows(data.details) as unknown as Prisma.InputJsonValue,
        }),
      },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        type: { select: { id: true, name: true } },
        holders: { select: AssetHoldersService.select },
      },
    });

    if (holderRows && before) {
      await this.activity.logHolderChange(data.id, data.organizationId, data.userId, before, holderRows);
    }

    return success(await this.withHolders(updated));
  }

  /**
   * Delete an asset
   */
  async delete(data: {
    id: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'delete assets');

    const asset = await this.prisma.asset.findUnique({
      where: { id: data.id },
      include: { _count: { select: { tasks: true } } },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.organizationId !== data.organizationId) {
      throw new ForbiddenException('Asset does not belong to your organization');
    }

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
  async getMaintenanceHistory(data: {
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
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'view maintenance history');

    const asset = await this.prisma.asset.findUnique({
      where: { id: data.id },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.organizationId !== data.organizationId) {
      throw new ForbiddenException('Asset does not belong to your organization');
    }

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
      duration: task.routeStartedAt && task.routeEndedAt
        ? Math.floor((task.routeEndedAt.getTime() - task.routeStartedAt.getTime()) / 1000)
        : null,
      assignedTo: task.assignedTo,
    }));

    return paginated(history, { page, limit, total });
  }
}

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
import { AssetActivityService } from './asset-activity.service';

/**
 * How deep a machine may nest. ISO 14224 breaks equipment down four levels
 * (unit, subunit, component, part); double that is generous, and a bound means
 * a corrupted parent chain costs one query per level rather than hanging.
 */
const MAX_STRUCTURE_DEPTH = 8;

/** One record in a machine's breakdown, with whatever sits inside it. */
export interface StructureNode {
  id: string;
  name: string;
  serialNumber: string | null;
  children: StructureNode[];
}

/**
 * The records themselves: the things an organization owns, what they are made
 * of, and who has them.
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
  private async resolveHolder(
    input: { holderUserId?: string | null; customerId?: string | null },
    organizationId: string,
  ): Promise<{ holderUserId: string | null; customerId: string | null }> {
    const holderUserId = input.holderUserId?.trim() || null;
    const customerId = input.customerId?.trim() || null;

    if (holderUserId) {
      const member = await this.prisma.user.findFirst({
        where: { id: holderUserId, organizationId },
        select: { id: true },
      });
      if (!member) throw new BadRequestException('That member is not in this organization');
      return { holderUserId, customerId: null };
    }

    if (customerId) {
      const client = await this.prisma.customer.findFirst({
        where: { id: customerId, organizationId },
        select: { id: true },
      });
      if (!client) throw new BadRequestException('That client is not in this organization');
      return { holderUserId: null, customerId };
    }

    return { holderUserId: null, customerId: null };
  }

  /**
   * The whole breakdown of one machine, with what it has cost.
   *
   * The entire subtree in ONE query, not a level per click: a technician
   * standing at a press wants to see that the fault is two levels down, and
   * walking the tree a request at a time turns that into a series of guesses.
   *
   * Money rolls UP. "What has this press cost" has to include its pump and its
   * gearbox, or the number is quietly wrong in the direction that matters —
   * every sub-unit's spend invisible at the level anybody looks.
   */
  async structure(data: {
    id: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'view assets');
    await this.access.assetInOrg(data.id, data.organizationId);

    // One recursive walk down, depth-bounded so a corrupted parent chain costs
    // a query rather than the process. Scoped to the org at every level: a
    // parent id is guessable, and an unscoped walk would happily cross tenants.
    const rows = await this.prisma.$queryRaw<
      { id: string; name: string; serialNumber: string | null; parentId: string | null; depth: number }[]
    >(Prisma.sql`
      WITH RECURSIVE subtree AS (
        SELECT a."id", a."name", a."serialNumber", a."parentId", 0 AS depth
          FROM "assets" a
         WHERE a."id" = ${data.id} AND a."organizationId" = ${data.organizationId}
        UNION ALL
        SELECT c."id", c."name", c."serialNumber", c."parentId", s.depth + 1
          FROM "assets" c
          JOIN subtree s ON c."parentId" = s."id"
         WHERE c."organizationId" = ${data.organizationId}
           AND s.depth < ${MAX_STRUCTURE_DEPTH}
      )
      SELECT * FROM subtree ORDER BY depth, "name"
    `);

    const ids = rows.map((r) => r.id);

    // Totals over the whole subtree, from the database rather than by adding up
    // what happened to be fetched.
    const [sums, ownSums] = await Promise.all([
      this.prisma.assetMoney.groupBy({
        by: ['direction'],
        where: { assetId: { in: ids }, organizationId: data.organizationId },
        _sum: { amountCents: true },
      }),
      this.prisma.assetMoney.groupBy({
        by: ['direction'],
        where: { assetId: data.id, organizationId: data.organizationId },
        _sum: { amountCents: true },
      }),
    ]);
    const totalOf = (g: typeof sums, d: string) =>
      g.find((x) => x.direction === d)?._sum.amountCents ?? 0;

    // Nest by parent. The root is the record itself, which the caller already
    // has, so only its children are returned as the tree.
    const byId = new Map<string, StructureNode>(
      rows.map((r) => [r.id, { id: r.id, name: r.name, serialNumber: r.serialNumber, children: [] }]),
    );
    const tree: StructureNode[] = [];
    for (const r of rows) {
      if (r.id === data.id) continue;
      const node = byId.get(r.id)!;
      // A child of the record itself is a TOP-level branch of the returned
      // tree. Attaching it to the root's own node instead put every branch
      // inside an object the caller never sees — the count said seven and the
      // screen said nothing.
      if (r.parentId === data.id) {
        tree.push(node);
        continue;
      }
      const parent = r.parentId ? byId.get(r.parentId) : undefined;
      if (parent) parent.children.push(node);
      else tree.push(node);
    }

    // The path back up, so somebody two levels down knows where they are.
    const path: { id: string; name: string }[] = [];
    let cursor = await this.prisma.asset.findUnique({
      where: { id: data.id },
      select: { parentId: true },
    });
    const seen = new Set<string>([data.id]);
    while (cursor?.parentId && !seen.has(cursor.parentId) && path.length < MAX_STRUCTURE_DEPTH) {
      seen.add(cursor.parentId);
      const parent = await this.prisma.asset.findFirst({
        where: { id: cursor.parentId, organizationId: data.organizationId },
        select: { id: true, name: true, parentId: true },
      });
      if (!parent) break;
      path.unshift({ id: parent.id, name: parent.name });
      cursor = { parentId: parent.parentId };
    }

    return success({
      tree,
      path,
      // children kept for callers that only want the level below.
      children: tree,
      rollup: {
        records: Math.max(0, rows.length - 1),
        inCents: totalOf(sums, 'IN'),
        outCents: totalOf(sums, 'OUT'),
        netCents: totalOf(sums, 'IN') - totalOf(sums, 'OUT'),
        ownOutCents: totalOf(ownSums, 'OUT'),
        ownInCents: totalOf(ownSums, 'IN'),
      },
    });
  }

  /**
   * Put one record under another, or back at the top.
   *
   * Refuses to make a record its own ancestor. Without that check a two-node
   * cycle is one careless drag away, and every walk of the tree afterwards
   * either loops forever or stops at an arbitrary depth.
   */
  async setParent(data: {
    id: string;
    parentId: string | null;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.access.assertMay(data as any, 'update assets');
    await this.access.assetInOrg(data.id, data.organizationId);

    const parentId = data.parentId?.trim() || null;

    if (parentId) {
      if (parentId === data.id) {
        throw new BadRequestException('A record cannot be inside itself');
      }
      const parent = await this.prisma.asset.findFirst({
        where: { id: parentId, organizationId: data.organizationId },
        select: { id: true },
      });
      if (!parent) throw new BadRequestException('That parent is not in this organization');

      // Walk up from the proposed parent: if we meet this record, the move
      // would close a loop.
      let cursor: string | null = parentId;
      const seen = new Set<string>();
      let depth = 0;
      while (cursor && depth++ < MAX_STRUCTURE_DEPTH) {
        if (cursor === data.id) {
          throw new BadRequestException('That would put this record inside one of its own parts');
        }
        if (seen.has(cursor)) break;
        seen.add(cursor);
        // Scoped: an unscoped walk follows a parent chain into another tenant's
        // records, and the ids it reads are the ids somebody guessed.
        const next: { parentId: string | null } | null = await this.prisma.asset.findFirst({
          where: { id: cursor, organizationId: data.organizationId },
          select: { parentId: true },
        });
        cursor = next?.parentId ?? null;
      }
    }

    const updated = await this.prisma.asset.update({
      where: { id: data.id },
      data: { parentId },
      select: { id: true, parentId: true },
    });

    return success(updated);
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

    // Verify category if provided
    if (data.categoryId) {
      const category = await this.prisma.assetCategory.findUnique({
        where: { id: data.categoryId },
      });

      if (!category || category.organizationId !== data.organizationId) {
        throw new BadRequestException('Invalid category');
      }
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
        ...(await this.resolveHolder(data, data.organizationId)),
        details: normalizeDetailRows(data.details) as unknown as Prisma.InputJsonValue,
      },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        type: { select: { id: true, name: true } },
      },
    });

    return success(asset);
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
    /** Only whole machines, not the parts inside them. */
    topLevel?: boolean;
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
      // A gearbox belongs under its press, not beside it. The kind's list shows
      // whole machines; the parts inside are reached through the machine.
      ...(query.topLevel ? { parentId: null } : {}),
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
          _count: { select: { tasks: true } },
        },
      }),
      this.prisma.asset.count({ where }),
    ]);

    return paginated(assets, { page, limit, total });
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
        customer: { select: { id: true, name: true, email: true, phone: true } },
        _count: { select: { tasks: true } },
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.organizationId !== data.organizationId) {
      throw new ForbiddenException('Asset does not belong to your organization');
    }

    // holderUserId carries no foreign key (removing a member must not block),
    // so the member is looked up rather than joined. Scoped to this org, and a
    // member who has since been removed simply resolves to null.
    const holderUser = asset.holderUserId
      ? await this.prisma.user.findFirst({
          where: { id: asset.holderUserId, organizationId: data.organizationId },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : null;

    return success({ ...asset, holderUser });
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

    // Resolved before the write, so the OLD holder is still readable and the
    // timeline entry can say what it changed from.
    const holderChange =
      data.holderUserId !== undefined || data.customerId !== undefined
        ? await this.resolveHolder(data, data.organizationId)
        : null;
    const before = holderChange ? await this.access.assetInOrg(data.id, data.organizationId) : null;

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
        // Holder is resolved together: sending either side re-decides both, so
        // moving a thing from a member to a client clears the member in one go.
        ...(holderChange ?? {}),
        ...(data.details !== undefined && {
          details: normalizeDetailRows(data.details) as unknown as Prisma.InputJsonValue,
        }),
      },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        type: { select: { id: true, name: true } },
      },
    });

    if (holderChange && before) {
      await this.activity.logHolderChange(
        data.id,
        data.organizationId,
        data.userId,
        { holderUserId: before.holderUserId, customerId: before.customerId },
        holderChange,
      );
    }

    return success(updated);
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

    // Clear asset reference from tasks (don't delete tasks)
    if (asset._count.tasks > 0) {
      await this.prisma.task.updateMany({
        where: { assetId: data.id },
        data: { assetId: null },
      });
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

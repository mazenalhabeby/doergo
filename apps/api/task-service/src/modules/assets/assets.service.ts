import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  Role, success, paginated, TaskStatus, normalizeKindShape, normalizeDetailRows, findMoneyCategory,
  findKindList, normalizeListRow, listRowIsEmpty,
} from '@hbcfield/shared';

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

/** Nobody may ask for more than this in one request, however they ask. */
const MAX_PAGE = 200;

@Injectable()
export class AssetsService {
  /**
   * Who may read, and who may change.
   *
   * This check was written out 25 times, each with its own message and its own
   * `as any` cast. Once is enough: a rule copied 25 times is a rule that will
   * eventually be copied wrong, and the cast hid that the caller's type never
   * admitted the flag it was reading.
   */
  private assertMay(
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
  private pageSize(limit: unknown, fallback = 20): number {
    const n = Number(limit);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return Math.min(Math.floor(n), MAX_PAGE);
  }

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // ASSET CATEGORIES
  // ============================================

  /**
   * Create a new asset category
   */
  async createCategory(data: {
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    spaceId?: string;
    config?: unknown;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    // Only CLIENT and DISPATCHER can create categories
    this.assertMay(data as any, 'create asset categories');

    // A kind belongs to a space, so the space must be one of THIS org's. Without
    // this check a caller could hang their kinds off another tenant's space by
    // passing its id.
    if (data.spaceId) {
      const space = await this.prisma.companyLocation.findFirst({
        where: { id: data.spaceId, organizationId: data.organizationId },
        select: { id: true },
      });
      if (!space) {
        throw new NotFoundException('Space not found in this organization');
      }
    }

    // Duplicate names are rejected per SPACE — two spaces may each have their
    // own "Vehicles", but one space may not have two.
    const existing = await this.prisma.assetCategory.findFirst({
      where: {
        organizationId: data.organizationId,
        spaceId: data.spaceId ?? null,
        name: data.name,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(`"${data.name}" already exists in this space`);
    }

    const category = await this.prisma.assetCategory.create({
      data: {
        name: data.name,
        description: data.description,
        icon: data.icon,
        color: data.color,
        organizationId: data.organizationId,
        spaceId: data.spaceId ?? null,
        // Normalised on the way in, so a malformed shape is rejected once here
        // rather than surprising every reader of the column later.
        config: normalizeKindShape(data.config) as unknown as Prisma.InputJsonValue,
      },
      include: {
        _count: { select: { types: true, assets: true } },
      },
    });

    return success(category);
  }

  /**
   * Get all categories for an organization
   */
  async findAllCategories(query: {
    userId: string;
    userRole: string;
    organizationId: string;
    spaceId?: string;
  }) {
    this.assertMay(query as any, 'view asset categories');

    const categories = await this.prisma.assetCategory.findMany({
      // Asking for a space returns THAT space's kinds only. Asking for none
      // returns everything the org has, which is what the org-wide screen wants.
      where: {
        organizationId: query.organizationId,
        ...(query.spaceId ? { spaceId: query.spaceId } : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { types: true, assets: true } },
      },
    });

    return success(categories);
  }

  /**
   * Update a category
   */
  async updateCategory(data: {
    config?: unknown;
    id: string;
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.assertMay(data as any, 'update asset categories');

    const category = await this.prisma.assetCategory.findUnique({
      where: { id: data.id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.organizationId !== data.organizationId) {
      throw new ForbiddenException('Category does not belong to your organization');
    }

    // Renaming: the clash is with the OTHER kinds in the same space, not the
    // whole org — another space is free to have a kind by this name.
    if (data.name && data.name !== category.name) {
      const existing = await this.prisma.assetCategory.findFirst({
        where: {
          organizationId: data.organizationId,
          spaceId: category.spaceId,
          name: data.name,
          id: { not: category.id },
        },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException(`"${data.name}" already exists in this space`);
      }
    }

    const updated = await this.prisma.assetCategory.update({
      where: { id: data.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.config !== undefined && {
          config: normalizeKindShape(data.config) as unknown as Prisma.InputJsonValue,
        }),
      },
      include: {
        _count: { select: { types: true, assets: true } },
      },
    });

    return success(updated);
  }

  /**
   * Delete a category (and its types)
   */
  async deleteCategory(data: {
    id: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.assertMay(data as any, 'delete asset categories');

    const category = await this.prisma.assetCategory.findUnique({
      where: { id: data.id },
      include: { _count: { select: { assets: true } } },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.organizationId !== data.organizationId) {
      throw new ForbiddenException('Category does not belong to your organization');
    }

    // Warn if there are assets (they will be orphaned, not deleted)
    if (category._count.assets > 0) {
      // Set assets' categoryId to null instead of blocking delete
      await this.prisma.asset.updateMany({
        where: { categoryId: data.id },
        data: { categoryId: null, typeId: null },
      });
    }

    await this.prisma.assetCategory.delete({ where: { id: data.id } });

    return success(null, 'Category deleted successfully');
  }

  // ============================================
  // ASSET TYPES
  // ============================================

  /**
   * Create a new asset type within a category
   */
  async createType(data: {
    categoryId: string;
    name: string;
    description?: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.assertMay(data as any, 'create asset types');

    // Verify category exists and belongs to org
    const category = await this.prisma.assetCategory.findUnique({
      where: { id: data.categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.organizationId !== data.organizationId) {
      throw new ForbiddenException('Category does not belong to your organization');
    }

    // Check for duplicate name in same category
    const existing = await this.prisma.assetType.findUnique({
      where: {
        categoryId_name: {
          categoryId: data.categoryId,
          name: data.name,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Type "${data.name}" already exists in this category`);
    }

    const type = await this.prisma.assetType.create({
      data: {
        name: data.name,
        description: data.description,
        categoryId: data.categoryId,
      },
      include: {
        category: { select: { id: true, name: true } },
        _count: { select: { assets: true } },
      },
    });

    return success(type);
  }

  /**
   * Get all types for a category
   */
  async findTypesByCategory(query: {
    categoryId: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.assertMay(query as any, 'view asset types');

    // Verify category belongs to org
    const category = await this.prisma.assetCategory.findUnique({
      where: { id: query.categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.organizationId !== query.organizationId) {
      throw new ForbiddenException('Category does not belong to your organization');
    }

    const types = await this.prisma.assetType.findMany({
      where: { categoryId: query.categoryId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { assets: true } },
      },
    });

    return success(types);
  }

  /**
   * Update a type
   */
  async updateType(data: {
    id: string;
    name?: string;
    description?: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.assertMay(data as any, 'update asset types');

    const type = await this.prisma.assetType.findUnique({
      where: { id: data.id },
      include: { category: true },
    });

    if (!type) {
      throw new NotFoundException('Type not found');
    }

    if (type.category.organizationId !== data.organizationId) {
      throw new ForbiddenException('Type does not belong to your organization');
    }

    // Check for duplicate name if changing name
    if (data.name && data.name !== type.name) {
      const existing = await this.prisma.assetType.findUnique({
        where: {
          categoryId_name: {
            categoryId: type.categoryId,
            name: data.name,
          },
        },
      });

      if (existing) {
        throw new ConflictException(`Type "${data.name}" already exists in this category`);
      }
    }

    const updated = await this.prisma.assetType.update({
      where: { id: data.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
      },
      include: {
        category: { select: { id: true, name: true } },
        _count: { select: { assets: true } },
      },
    });

    return success(updated);
  }

  /**
   * Delete a type
   */
  async deleteType(data: {
    id: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.assertMay(data as any, 'delete asset types');

    const type = await this.prisma.assetType.findUnique({
      where: { id: data.id },
      include: {
        category: true,
        _count: { select: { assets: true } },
      },
    });

    if (!type) {
      throw new NotFoundException('Type not found');
    }

    if (type.category.organizationId !== data.organizationId) {
      throw new ForbiddenException('Type does not belong to your organization');
    }

    // Set assets' typeId to null instead of blocking delete
    if (type._count.assets > 0) {
      await this.prisma.asset.updateMany({
        where: { typeId: data.id },
        data: { typeId: null },
      });
    }

    await this.prisma.assetType.delete({ where: { id: data.id } });

    return success(null, 'Type deleted successfully');
  }

  // ============================================
  // ASSETS
  // ============================================

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
   * Confirm an asset is this organization's before anything reads or writes it.
   *
   * Ids are guessable, so every activity call goes through here rather than
   * trusting the id in the URL. Returns the row, since callers need it anyway.
   */
  private async assetInOrg(id: string, organizationId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, organizationId },
      select: { id: true, holderUserId: true, customerId: true, categoryId: true },
    });
    if (!asset) throw new NotFoundException('Asset not found in this organization');
    return asset;
  }

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
    this.assertMay(data as any, 'view assets');
    await this.assetInOrg(data.id, data.organizationId);

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
    this.assertMay(data as any, 'update assets');
    await this.assetInOrg(data.id, data.organizationId);

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
  private async logHolderChange(
    assetId: string,
    organizationId: string,
    authorId: string,
    from: { holderUserId: string | null; customerId: string | null },
    to: { holderUserId: string | null; customerId: string | null },
  ) {
    if (from.holderUserId === to.holderUserId && from.customerId === to.customerId) return;
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

  /**
   * The money logged against one asset, newest first, with the totals.
   *
   * Totals come from a groupBy over the WHOLE ledger, not from summing the page
   * — a total that only counted the rows currently on screen would be wrong the
   * moment there were more than a page of them, and wrong quietly.
   */
  async listMoney(data: {
    id: string;
    limit?: number;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.assertMay(data as any, 'view assets');
    await this.assetInOrg(data.id, data.organizationId);

    const take = Math.min(Math.max(data.limit ?? 100, 1), 200);

    const [entries, sums] = await Promise.all([
      this.prisma.assetMoney.findMany({
        where: { assetId: data.id },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take,
      }),
      this.prisma.assetMoney.groupBy({
        by: ['direction'],
        where: { assetId: data.id },
        _sum: { amountCents: true },
      }),
    ]);

    const totalFor = (direction: string) =>
      sums.find((s) => s.direction === direction)?._sum.amountCents ?? 0;
    const inCents = totalFor('IN');
    const outCents = totalFor('OUT');

    return success({
      entries,
      totals: { inCents, outCents, netCents: inCents - outCents },
    });
  }

  /**
   * Log money against an asset.
   *
   * The category must be one its KIND declares. A free-text heading would split
   * a total between "Repairs" and "repair" and neither half would look wrong.
   * The label is then STORED, so renaming the category later leaves history
   * reading as it did at the time.
   */
  async addMoney(data: {
    id: string;
    category: string;
    amountCents: number;
    note?: string;
    occurredAt?: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.assertMay(data as any, 'update assets');

    const asset = await this.prisma.asset.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true, category: { select: { config: true } } },
    });
    if (!asset) throw new NotFoundException('Asset not found in this organization');

    const shape = normalizeKindShape(asset.category?.config);
    if (!shape.money.enabled) {
      throw new BadRequestException('This kind does not track money');
    }

    const category = findMoneyCategory(shape, data.category ?? '');
    if (!category) {
      throw new BadRequestException(`"${data.category}" is not a category on this kind`);
    }

    // Cents, and never negative — the direction decides the sign, so a negative
    // amount here would silently invert an entry.
    const amountCents = Math.abs(Math.round(Number(data.amountCents)));
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new BadRequestException('An amount is needed');
    }

    const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('That date could not be read');
    }

    const entry = await this.prisma.assetMoney.create({
      data: {
        organizationId: data.organizationId,
        assetId: data.id,
        category: category.label,
        direction: category.direction === 'in' ? 'IN' : 'OUT',
        amountCents,
        note: data.note?.trim().slice(0, 500) || null,
        occurredAt,
        authorId: data.userId,
      },
    });

    return success(entry);
  }

  /** Remove one entry. Scoped to the asset, so an id alone is not enough. */
  async removeMoney(data: {
    id: string;
    entryId: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.assertMay(data as any, 'update assets');
    await this.assetInOrg(data.id, data.organizationId);

    const { count } = await this.prisma.assetMoney.deleteMany({
      where: { id: data.entryId, assetId: data.id, organizationId: data.organizationId },
    });
    if (!count) throw new NotFoundException('Entry not found');

    return success({ id: data.entryId });
  }

  /**
   * The rows of one table on a record — a machine's parts, an apartment's keys.
   *
   * Paged, because a machine can have hundreds of parts and a record page must
   * not pay for all of them. Search runs in SQL over the row's JSON rather than
   * in JavaScript over a fetched page, or it would only ever find what happened
   * to be on screen.
   */
  async listRows(data: {
    id: string;
    list: string;
    search?: string;
    page?: number;
    limit?: number;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.assertMay(data as any, 'view assets');
    const { list, owner } = await this.assetList(data.id, data.list, data.organizationId);

    const page = Math.max(1, data.page ?? 1);
    const limit = Math.min(Math.max(data.limit ?? 50, 1), 200);
    const search = data.search?.trim();

    const where: Prisma.AssetListRowWhereInput = {
      ...owner,
      list: list.label,
      // string_contains over the whole row would need a column; matching any
      // declared column keeps it to the values people actually see.
      ...(search
        ? {
            OR: list.columns.map((c) => ({
              values: { path: [c.label], string_contains: search } as Prisma.JsonFilter,
            })),
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.assetListRow.findMany({
        where,
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.assetListRow.count({ where }),
    ]);

    return paginated(rows, { page, limit, total });
  }

  /** Add a row. Values are cleaned against the columns the list declares. */
  async addRow(data: {
    id: string;
    list: string;
    values: unknown;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.assertMay(data as any, 'update assets');
    const { list, owner } = await this.assetList(data.id, data.list, data.organizationId);

    const values = normalizeListRow(list, data.values);
    if (listRowIsEmpty(values)) {
      throw new BadRequestException('A row needs something in it');
    }

    // Appended, not inserted: a row lands where somebody expects it to.
    const last = await this.prisma.assetListRow.findFirst({
      where: { ...owner, list: list.label },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const row = await this.prisma.assetListRow.create({
      data: {
        organizationId: data.organizationId,
        ...owner,
        list: list.label,
        values: values as unknown as Prisma.InputJsonValue,
        position: (last?.position ?? 0) + 1,
      },
    });

    return success(row);
  }

  /** Change one row. */
  async updateRow(data: {
    id: string;
    rowId: string;
    values: unknown;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.assertMay(data as any, 'update assets');
    await this.assetInOrg(data.id, data.organizationId);

    // Scoped to the ORG, then re-checked against the resolved owner below: a
    // shared row belongs to the kind, so scoping the lookup to this asset would
    // make the catalogue read-only from every record that uses it.
    const existing = await this.prisma.assetListRow.findFirst({
      where: { id: data.rowId, organizationId: data.organizationId },
    });
    if (!existing) throw new NotFoundException('Row not found');

    const { list, owner } = await this.assetList(data.id, existing.list, data.organizationId);
    if (
      (owner.assetId && existing.assetId !== owner.assetId) ||
      (owner.categoryId && existing.categoryId !== owner.categoryId)
    ) {
      throw new NotFoundException('Row not found');
    }
    const values = normalizeListRow(list, data.values);
    if (listRowIsEmpty(values)) {
      throw new BadRequestException('A row needs something in it');
    }

    const row = await this.prisma.assetListRow.update({
      where: { id: data.rowId },
      data: { values: values as unknown as Prisma.InputJsonValue },
    });

    return success(row);
  }

  /** Remove one row, from this record or from the kind's shared catalogue. */
  async removeRow(data: {
    id: string;
    rowId: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.assertMay(data as any, 'update assets');
    const asset = await this.assetInOrg(data.id, data.organizationId);

    // Either this record's own row, or a row of a catalogue this record's kind
    // owns. Never another kind's, and never another record's.
    const { count } = await this.prisma.assetListRow.deleteMany({
      where: {
        id: data.rowId,
        organizationId: data.organizationId,
        OR: [{ assetId: data.id }, ...(asset.categoryId ? [{ categoryId: asset.categoryId }] : [])],
      },
    });
    if (!count) throw new NotFoundException('Row not found');

    return success({ id: data.rowId });
  }

  /**
   * Resolve an asset and one of the lists its KIND declares.
   *
   * The list must be declared, for the same reason a money category must be:
   * free-text names would split one table into "Parts" and "parts" and neither
   * would look wrong.
   */
  private async assetList(assetId: string, listLabel: string, organizationId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId },
      select: { id: true, categoryId: true, category: { select: { config: true } } },
    });
    if (!asset) throw new NotFoundException('Asset not found in this organization');

    const shape = normalizeKindShape(asset.category?.config);
    const list = findKindList(shape, listLabel ?? '');
    if (!list) throw new BadRequestException(`"${listLabel}" is not a list on this kind`);

    // A shared table's rows hang off the KIND, so every record of that kind
    // reads the same catalogue. Resolving the owner here means every caller
    // below is identical whichever sort of table it is.
    const owner = list.shared
      ? { categoryId: asset.categoryId, assetId: null }
      : { assetId: asset.id, categoryId: null };

    if (list.shared && !asset.categoryId) {
      throw new BadRequestException('This record has no kind, so it has no shared catalogue');
    }

    return { shape, list, owner };
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
    this.assertMay(data as any, 'view assets');
    await this.assetInOrg(data.id, data.organizationId);

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
    this.assertMay(data as any, 'update assets');
    await this.assetInOrg(data.id, data.organizationId);

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
    this.assertMay(data as any, 'create assets');

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
    this.assertMay(query as any, 'view assets');

    const page = Math.max(1, query.page || 1);
    const limit = this.pageSize(query.limit);
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
    this.assertMay(data as any, 'view assets');

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
    this.assertMay(data as any, 'update assets');

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
    const before = holderChange ? await this.assetInOrg(data.id, data.organizationId) : null;

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
      await this.logHolderChange(
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
    this.assertMay(data as any, 'delete assets');

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
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    this.assertMay(data as any, 'view maintenance history');

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
    const limit = this.pageSize(data.limit);
    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          assetId: data.id,
          status: { in: [TaskStatus.COMPLETED, TaskStatus.CLOSED] },
        },
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.task.count({
        where: {
          assetId: data.id,
          status: { in: [TaskStatus.COMPLETED, TaskStatus.CLOSED] },
        },
      }),
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

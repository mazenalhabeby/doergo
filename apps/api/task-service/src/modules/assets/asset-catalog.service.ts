import {
  Injectable,
  Optional,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, normalizeKindShape, assertFoundInOrg } from '@hbcfield/shared';
import { AssetAccessService, type AssetActor } from './asset-access.service';
import { AssetLogService } from './asset-log.service';

/** Did the parts of a kind that decide readings and due dates change? Labels and colours do not. */
function logRulesChanged(before: unknown, after: unknown): boolean {
  const rules = (raw: unknown) =>
    JSON.stringify(
      normalizeKindShape(raw).logTypes.map((t) => ({
        key: t.key,
        due: t.due,
        meters: t.fields.filter((f) => f.type === 'number' && f.meter).map((f) => f.key),
      })),
    );
  return rules(before) !== rules(after);
}

/**
 * Kinds and their types — the shapes records are made from.
 *
 * Separate from records because it changes for different reasons and by
 * different people: somebody designs a kind once, and somebody else adds
 * records to it all day.
 */
@Injectable()
export class AssetCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
    // Optional so a test of the catalogue alone need not build the logbook.
    @Optional() private readonly logs?: AssetLogService,
  ) {}

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
  } & AssetActor) {
    this.access.assertMay(data, 'manage', 'create asset categories');
    /*
      A kind IS a workspace's configuration, so a workspace manager creates
      kinds in THEIR workspace and nowhere else — and never an org-level kind
      (no workspace), which only an org-wide grant can reach afterwards. Same
      404 as a workspace of another tenant: no list of other depots.
    */
    if (!this.access.mayIn(data, 'manage', data.spaceId ?? null)) {
      if (!data.spaceId) throw new ForbiddenException('Choose a workspace you manage for this type');
      throw new NotFoundException('Space not found in this organization');
    }

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
        // Counted the way the list is READ: whole records, not the sub-units
        // inside them. A card saying 9 over a list of 2 is a card nobody trusts.
        _count: { select: { types: true, assets: true } },
      },
    });

    return success(category);
  }

  /**
   * Get all categories for an organization
   */
  async findAllCategories(query: { spaceId?: string } & AssetActor) {
    this.access.assertMay(query, 'view', 'view asset categories');

    /*
      Asking for a space returns THAT space's kinds only; asking for none
      returns everything the org has — for an org-wide caller. A space-scoped
      one is confined to their own workspaces whatever they ask for: the same
      intersecting filter the records list uses, so a kind and its records can
      never be visible to different people.
    */
    const scope = this.access.spaceFilter(query, 'view', query.spaceId);
    const categories = await this.prisma.assetCategory.findMany({
      where: {
        organizationId: query.organizationId,
        ...(scope ?? {}),
      },
      orderBy: { name: 'asc' },
      include: {
        // Counted the way the list is READ: whole records, not the sub-units
        // inside them. A card saying 9 over a list of 2 is a card nobody trusts.
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
  } & AssetActor) {
    // Its own workspace, or 404. A kind's workspace is not editable here, so it stays where it was made.
    const category = await this.access.kindInScope(data.id, data, 'manage');

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
        // Counted the way the list is READ: whole records, not the sub-units
        // inside them. A card saying 9 over a list of 2 is a card nobody trusts.
        _count: { select: { types: true, assets: true } },
      },
    });

    /*
      A due rule added, changed or removed on the kind changes where every one
      of its records stands — and the stored state would otherwise wait for
      each record's next entry to find out. "Oil every 15,000 km", added to a
      fleet with a year of history, should show on every van the same minute.
      Only when the rules actually moved, and in the background: a kind with
      four hundred flats must not hold the save.
    */
    if (data.config !== undefined && this.logs && logRulesChanged(category.config, updated.config)) {
      void this.logs.recomputeKind(updated.id);
    }

    return success(updated);
  }

  /**
   * Delete a category (and its types)
   */
  async deleteCategory(data: { id: string } & AssetActor) {
    await this.access.kindInScope(data.id, data, 'manage');

    const category = await this.prisma.assetCategory.findUnique({
      where: { id: data.id },
      include: { _count: { select: { assets: true } } },
    });

    assertFoundInOrg(category, data.organizationId, 'Category');

    /*
      A type may only be deleted once it is empty.

      This used to detach its assets instead — categoryId to null — and that is
      where every orphaned asset came from. The space lives on the TYPE, so an
      asset without one belongs to no space: it disappears from every screen
      while remaining a real record, still attached to its tasks, and still
      counted on the bill. Silently invisible and chargeable.

      Refusing is the same rule a space already follows (empty-only hard
      delete), and it leaves the person with a choice they can actually act on:
      move the assets into another type, or delete them first.
    */
    if (category._count.assets > 0) {
      throw new BadRequestException(
        `This type still holds ${category._count.assets} ${category._count.assets === 1 ? 'asset' : 'assets'}. Move or delete them first.`,
      );
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
  } & AssetActor) {
    // A subtype is vocabulary of its kind's workspace — managed there, or 404.
    await this.access.kindInScope(data.categoryId, data, 'manage');

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
  async findTypesByCategory(query: { categoryId: string } & AssetActor) {
    // Read in the kind's own workspace, or 404 — the same reach as its records.
    await this.access.kindInScope(query.categoryId, query, 'view');

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
  } & AssetActor) {
    this.access.assertMay(data, 'manage', 'update asset types');

    const type = await this.prisma.assetType.findUnique({
      where: { id: data.id },
      include: { category: true },
    });

    if (!type) {
      throw new NotFoundException('Type not found');
    }

    // Another org's, or another workspace's: the same answer — no existence oracle.
    if (type.category.organizationId !== data.organizationId || !this.access.mayIn(data, 'manage', type.category.spaceId)) {
      throw new NotFoundException('Type not found');
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
  async deleteType(data: { id: string } & AssetActor) {
    this.access.assertMay(data, 'manage', 'delete asset types');

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

    // Another org's, or another workspace's: the same answer — no existence oracle.
    if (type.category.organizationId !== data.organizationId || !this.access.mayIn(data, 'manage', type.category.spaceId)) {
      throw new NotFoundException('Type not found');
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
}

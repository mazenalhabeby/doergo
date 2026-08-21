import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, normalizeKindShape } from '@hbcfield/shared';
import { AssetAccessService } from './asset-access.service';

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
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    // Only CLIENT and DISPATCHER can create categories
    this.access.assertMay(data as any, 'create asset categories');

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
        _count: { select: { types: true, assets: { where: { parentId: null } } } },
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
    this.access.assertMay(query as any, 'view asset categories');

    const categories = await this.prisma.assetCategory.findMany({
      // Asking for a space returns THAT space's kinds only. Asking for none
      // returns everything the org has, which is what the org-wide screen wants.
      where: {
        organizationId: query.organizationId,
        ...(query.spaceId ? { spaceId: query.spaceId } : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        // Counted the way the list is READ: whole records, not the sub-units
        // inside them. A card saying 9 over a list of 2 is a card nobody trusts.
        _count: { select: { types: true, assets: { where: { parentId: null } } } },
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
    this.access.assertMay(data as any, 'update asset categories');

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
        // Counted the way the list is READ: whole records, not the sub-units
        // inside them. A card saying 9 over a list of 2 is a card nobody trusts.
        _count: { select: { types: true, assets: { where: { parentId: null } } } },
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
    this.access.assertMay(data as any, 'delete asset categories');

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
    this.access.assertMay(data as any, 'create asset types');

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
    this.access.assertMay(query as any, 'view asset types');

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
    this.access.assertMay(data as any, 'update asset types');

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
    this.access.assertMay(data as any, 'delete asset types');

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
}

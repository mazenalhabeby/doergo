import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { success } from '@hbcfield/shared';
import { AssetAccessService, type AssetActor } from './asset-access.service';

/** Asset types inside a kind: adding, listing, editing, removing. */
@Injectable()
export class AssetTypesService {


  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
  ) {}


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
}

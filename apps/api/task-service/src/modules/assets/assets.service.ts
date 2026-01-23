import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Role, success, paginated, TaskStatus } from '@doergo/shared';

@Injectable()
export class AssetsService {
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
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    // Only CLIENT and DISPATCHER can create categories
    if (data.userRole !== Role.CLIENT && data.userRole !== Role.DISPATCHER) {
      throw new ForbiddenException('Only clients and dispatchers can create asset categories');
    }

    // Check for duplicate name in same org
    const existing = await this.prisma.assetCategory.findUnique({
      where: {
        organizationId_name: {
          organizationId: data.organizationId,
          name: data.name,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Category "${data.name}" already exists in your organization`);
    }

    const category = await this.prisma.assetCategory.create({
      data: {
        name: data.name,
        description: data.description,
        icon: data.icon,
        color: data.color,
        organizationId: data.organizationId,
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
  }) {
    if (query.userRole !== Role.CLIENT && query.userRole !== Role.DISPATCHER) {
      throw new ForbiddenException('Only clients and dispatchers can view asset categories');
    }

    const categories = await this.prisma.assetCategory.findMany({
      where: { organizationId: query.organizationId },
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
    id: string;
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    if (data.userRole !== Role.CLIENT && data.userRole !== Role.DISPATCHER) {
      throw new ForbiddenException('Only clients and dispatchers can update asset categories');
    }

    const category = await this.prisma.assetCategory.findUnique({
      where: { id: data.id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.organizationId !== data.organizationId) {
      throw new ForbiddenException('Category does not belong to your organization');
    }

    // Check for duplicate name if changing name
    if (data.name && data.name !== category.name) {
      const existing = await this.prisma.assetCategory.findUnique({
        where: {
          organizationId_name: {
            organizationId: data.organizationId,
            name: data.name,
          },
        },
      });

      if (existing) {
        throw new ConflictException(`Category "${data.name}" already exists in your organization`);
      }
    }

    const updated = await this.prisma.assetCategory.update({
      where: { id: data.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.color !== undefined && { color: data.color }),
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
    if (data.userRole !== Role.CLIENT && data.userRole !== Role.DISPATCHER) {
      throw new ForbiddenException('Only clients and dispatchers can delete asset categories');
    }

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
    if (data.userRole !== Role.CLIENT && data.userRole !== Role.DISPATCHER) {
      throw new ForbiddenException('Only clients and dispatchers can create asset types');
    }

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
    if (query.userRole !== Role.CLIENT && query.userRole !== Role.DISPATCHER) {
      throw new ForbiddenException('Only clients and dispatchers can view asset types');
    }

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
    if (data.userRole !== Role.CLIENT && data.userRole !== Role.DISPATCHER) {
      throw new ForbiddenException('Only clients and dispatchers can update asset types');
    }

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
    if (data.userRole !== Role.CLIENT && data.userRole !== Role.DISPATCHER) {
      throw new ForbiddenException('Only clients and dispatchers can delete asset types');
    }

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
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    if (data.userRole !== Role.CLIENT && data.userRole !== Role.DISPATCHER) {
      throw new ForbiddenException('Only clients and dispatchers can create assets');
    }

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
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    if (query.userRole !== Role.CLIENT && query.userRole !== Role.DISPATCHER) {
      throw new ForbiddenException('Only clients and dispatchers can view assets');
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
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
    if (data.userRole !== Role.CLIENT && data.userRole !== Role.DISPATCHER) {
      throw new ForbiddenException('Only clients and dispatchers can view assets');
    }

    const asset = await this.prisma.asset.findUnique({
      where: { id: data.id },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        type: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.organizationId !== data.organizationId) {
      throw new ForbiddenException('Asset does not belong to your organization');
    }

    return success(asset);
  }

  /**
   * Update an asset
   */
  async update(data: {
    id: string;
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
    if (data.userRole !== Role.CLIENT && data.userRole !== Role.DISPATCHER) {
      throw new ForbiddenException('Only clients and dispatchers can update assets');
    }

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
      },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        type: { select: { id: true, name: true } },
      },
    });

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
    if (data.userRole !== Role.CLIENT && data.userRole !== Role.DISPATCHER) {
      throw new ForbiddenException('Only clients and dispatchers can delete assets');
    }

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
    if (data.userRole !== Role.CLIENT && data.userRole !== Role.DISPATCHER) {
      throw new ForbiddenException('Only clients and dispatchers can view maintenance history');
    }

    const asset = await this.prisma.asset.findUnique({
      where: { id: data.id },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.organizationId !== data.organizationId) {
      throw new ForbiddenException('Asset does not belong to your organization');
    }

    const page = data.page || 1;
    const limit = data.limit || 20;
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

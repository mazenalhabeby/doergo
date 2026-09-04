import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Role } from '@hbcfield/shared';
import { RequirePermission, DenyExternal } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AssetsService } from './assets.service';
import { AssetsQueueService } from './assets.queue.service';
import {
  CreateAssetCategoryDto,
  UpdateAssetCategoryDto,
  CreateAssetTypeDto,
  UpdateAssetTypeDto,
} from './dto';

@ApiTags('asset-categories')
@ApiBearerAuth()
/*
  The organization's own property, not the work at a site.

  An external supervisor holds `canViewAllTasks` in their space — it is how they
  follow the work they are there to supervise — and this surface was gated on
  that same permission, so granting the first silently granted the second and an
  outsider could list the organization's records. The relationship disqualifies
  them, not the permission, so the rule is stated about the relationship.
*/
@DenyExternal()
@Controller('asset-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetCategoriesController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly assetsQueueService: AssetsQueueService,
  ) {}

  // ============================================
  // CATEGORIES
  // ============================================

  @Post()
  /*
    A WRITE, so it asks the WRITE permission.

    These were `canViewAllTasks` — a read permission authorising changes to the
    organization's equipment, which is how somebody given sight of the work
    quietly gains the ability to edit the asset register. `canManageAssets`
    exists precisely for this and was being bypassed.

    Nobody loses the ability: the migration granted `canManageAssets` to every
    role that already had it through the old gate.
  */
  @RequirePermission('canManageAssets')
  @ApiOperation({ summary: 'Create a new asset category' })
  async createCategory(@Body() dto: CreateAssetCategoryDto, @Request() req: any) {
    return this.assetsQueueService.createCategory({
      ...dto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get()
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'List asset kinds — a space\'s own, or the whole org' })
  @ApiQuery({ name: 'spaceId', required: false, description: "Only this space's kinds" })
  async findAllCategories(@Request() req: any, @Query('spaceId') spaceId?: string) {
    return this.assetsService.findAllCategories({
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
      spaceId,
    });
  }

  @Patch(':id')
  @RequirePermission('canManageAssets')
  @ApiOperation({ summary: 'Update a category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateAssetCategoryDto,
    @Request() req: any,
  ) {
    return this.assetsQueueService.updateCategory({
      id,
      ...dto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id')
  @RequirePermission('canManageAssets')
  @ApiOperation({ summary: 'Delete a category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  async deleteCategory(@Param('id') id: string, @Request() req: any) {
    return this.assetsQueueService.deleteCategory({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  // ============================================
  // TYPES (nested under categories)
  // ============================================

  @Post(':categoryId/types')
  @RequirePermission('canManageAssets')
  @ApiOperation({ summary: 'Create a new asset type in a category' })
  @ApiParam({ name: 'categoryId', description: 'Category ID' })
  async createType(
    @Param('categoryId') categoryId: string,
    @Body() dto: CreateAssetTypeDto,
    @Request() req: any,
  ) {
    return this.assetsQueueService.createType({
      categoryId,
      ...dto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':categoryId/types')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'List all types in a category' })
  @ApiParam({ name: 'categoryId', description: 'Category ID' })
  async findTypesByCategory(
    @Param('categoryId') categoryId: string,
    @Request() req: any,
  ) {
    return this.assetsService.findTypesByCategory({
      categoryId,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }
}

// Separate controller for type updates/deletes (not nested under category)
@ApiTags('asset-types')
@ApiBearerAuth()
/*
  The organization's own property, not the work at a site.

  An external supervisor holds `canViewAllTasks` in their space — it is how they
  follow the work they are there to supervise — and this surface was gated on
  that same permission, so granting the first silently granted the second and an
  outsider could list the organization's records. The relationship disqualifies
  them, not the permission, so the rule is stated about the relationship.
*/
@DenyExternal()
@Controller('asset-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetTypesController {
  constructor(
    private readonly assetsQueueService: AssetsQueueService,
  ) {}

  @Patch(':id')
  @RequirePermission('canManageAssets')
  @ApiOperation({ summary: 'Update an asset type' })
  @ApiParam({ name: 'id', description: 'Type ID' })
  async updateType(
    @Param('id') id: string,
    @Body() dto: UpdateAssetTypeDto,
    @Request() req: any,
  ) {
    return this.assetsQueueService.updateType({
      id,
      ...dto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id')
  @RequirePermission('canManageAssets')
  @ApiOperation({ summary: 'Delete an asset type' })
  @ApiParam({ name: 'id', description: 'Type ID' })
  async deleteType(@Param('id') id: string, @Request() req: any) {
    return this.assetsQueueService.deleteType({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }
}

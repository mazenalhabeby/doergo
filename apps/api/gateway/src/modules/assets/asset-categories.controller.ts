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
import { RequirePermission } from '../../common/decorators';
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
  @RequirePermission('canViewAllTasks')
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
  @RequirePermission('canViewAllTasks')
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
  @RequirePermission('canViewAllTasks')
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
  @RequirePermission('canViewAllTasks')
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
@Controller('asset-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetTypesController {
  constructor(
    private readonly assetsQueueService: AssetsQueueService,
  ) {}

  @Patch(':id')
  @RequirePermission('canViewAllTasks')
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
  @RequirePermission('canViewAllTasks')
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

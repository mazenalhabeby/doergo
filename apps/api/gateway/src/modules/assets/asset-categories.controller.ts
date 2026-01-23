import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { Role } from '@doergo/shared';
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
  @Roles(Role.CLIENT, Role.DISPATCHER)
  @ApiOperation({ summary: 'Create a new asset category' })
  async createCategory(@Body() dto: CreateAssetCategoryDto, @Request() req: any) {
    return this.assetsQueueService.createCategory({
      ...dto,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Get()
  @Roles(Role.CLIENT, Role.DISPATCHER)
  @ApiOperation({ summary: 'List all asset categories' })
  async findAllCategories(@Request() req: any) {
    return this.assetsService.findAllCategories({
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id')
  @Roles(Role.CLIENT, Role.DISPATCHER)
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
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id')
  @Roles(Role.CLIENT, Role.DISPATCHER)
  @ApiOperation({ summary: 'Delete a category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  async deleteCategory(@Param('id') id: string, @Request() req: any) {
    return this.assetsQueueService.deleteCategory({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }

  // ============================================
  // TYPES (nested under categories)
  // ============================================

  @Post(':categoryId/types')
  @Roles(Role.CLIENT, Role.DISPATCHER)
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
      organizationId: req.user.organizationId,
    });
  }

  @Get(':categoryId/types')
  @Roles(Role.CLIENT, Role.DISPATCHER)
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
  @Roles(Role.CLIENT, Role.DISPATCHER)
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
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id')
  @Roles(Role.CLIENT, Role.DISPATCHER)
  @ApiOperation({ summary: 'Delete an asset type' })
  @ApiParam({ name: 'id', description: 'Type ID' })
  async deleteType(@Param('id') id: string, @Request() req: any) {
    return this.assetsQueueService.deleteType({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      organizationId: req.user.organizationId,
    });
  }
}

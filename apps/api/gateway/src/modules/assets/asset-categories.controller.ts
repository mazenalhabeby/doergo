import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { RequirePermissionInSpace } from '../../common/decorators';
import { AssetsService } from './assets.service';
import { AssetsQueueService } from './assets.queue.service';
import { CreateAssetCategoryDto, UpdateAssetCategoryDto, CreateAssetTypeDto, UpdateAssetTypeDto } from './dto';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { assetActor } from './asset-actor';

import type { AuthedRequest } from '../../common/request.types';
@ApiTags('asset-categories')
@ApiBearerAuth()
/*
  Kinds (and their subtypes) are ONE workspace's configuration of its
  register — so they follow the register's keys, in that workspace:

    reading kinds            — canViewAssets in their workspace
    creating / editing kinds — canManageAssets in THAT workspace; a workspace
                               manager creates kinds in their workspace only,
                               never an org-level kind (no workspace)

  The guard asks "somewhere?" (or, for a create naming `spaceId` in the body,
  "in that workspace?"); task-service checks each kind's real `spaceId` and
  answers 404 outside the caller's workspaces.

  ⚠️ No `@DenyExternal()` any more. It closed this surface because the reads
  rode on `canViewAllTasks`, which an external supervisor holds to follow the
  work. The register has its own keys now, granted per workspace on purpose,
  so an external member may read — or, given `canManageAssets`, shape — the
  kinds of THEIR workspace, exactly as its records, and nothing outside it.
*/
/**
 * ⚠️ This had NO module gate. Kinds are the Assets module's own configuration — the same purchase.
 *
 * ModuleGuard resolves the space from the request and falls back to the
 * organization's set when there is none, and it passes reads by design.
 */
@RequireModule('assets')
@Controller('asset-categories')
export class AssetCategoriesController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly assetsQueueService: AssetsQueueService,
  ) {}

  // ============================================
  // CATEGORIES
  // ============================================

  /*
    A WRITE, so it asks the WRITE permission — in the workspace named by the
    body's `spaceId`, which IS stored on the kind (unlike a record's). No
    workspace named means an org-level kind, which the service refuses to
    anybody short of an org-wide manager.
  */
  @Post()
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Create a new asset category' })
  async createCategory(@Body() dto: CreateAssetCategoryDto, @Request() req: AuthedRequest) {
    return this.assetsQueueService.createCategory({
      ...dto,
      ...assetActor(req),
    });
  }

  /*
    A space's own kinds, or every kind the caller may read. The service
    narrows by the caller's workspaces, intersecting any requested `spaceId`
    rather than trusting it — a kind and its records can never be visible to
    different people.
  */
  @Get()
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: "List asset kinds — a space's own, or the whole org" })
  @ApiQuery({ name: 'spaceId', required: false, description: "Only this space's kinds" })
  async findAllCategories(@Request() req: AuthedRequest, @Query('spaceId') spaceId?: string) {
    return this.assetsService.findAllCategories({
      spaceId,
      ...assetActor(req),
    });
  }

  @Patch(':id')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Update a category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  async updateCategory(@Param('id') id: string, @Body() dto: UpdateAssetCategoryDto, @Request() req: AuthedRequest) {
    return this.assetsQueueService.updateCategory({
      id,
      ...dto,
      ...assetActor(req),
    });
  }

  @Delete(':id')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Delete a category' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  async deleteCategory(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.assetsQueueService.deleteCategory({
      id,
      ...assetActor(req),
    });
  }

  // ============================================
  // TYPES (nested under categories)
  // ============================================

  @Post(':categoryId/types')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Create a new asset type in a category' })
  @ApiParam({ name: 'categoryId', description: 'Category ID' })
  async createType(
    @Param('categoryId') categoryId: string,
    @Body() dto: CreateAssetTypeDto,
    @Request() req: AuthedRequest,
  ) {
    return this.assetsQueueService.createType({
      categoryId,
      ...dto,
      ...assetActor(req),
    });
  }

  @Get(':categoryId/types')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'List all types in a category' })
  @ApiParam({ name: 'categoryId', description: 'Category ID' })
  async findTypesByCategory(@Param('categoryId') categoryId: string, @Request() req: AuthedRequest) {
    return this.assetsService.findTypesByCategory({
      categoryId,
      ...assetActor(req),
    });
  }
}

// Separate controller for type updates/deletes (not nested under category)
@ApiTags('asset-types')
@ApiBearerAuth()
/*
  A subtype sits under a kind and follows it: managed in the kind's workspace,
  decided in task-service by the kind's real `spaceId` (404 outside). No
  `@DenyExternal()` — see AssetCategoriesController.
*/
/**
 * ⚠️ This had NO module gate. Types sit under a kind, so they follow it.
 *
 * ModuleGuard resolves the space from the request and falls back to the
 * organization's set when there is none, and it passes reads by design.
 */
@RequireModule('assets')
@Controller('asset-types')
export class AssetTypesController {
  constructor(private readonly assetsQueueService: AssetsQueueService) {}

  @Patch(':id')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Update an asset type' })
  @ApiParam({ name: 'id', description: 'Type ID' })
  async updateType(@Param('id') id: string, @Body() dto: UpdateAssetTypeDto, @Request() req: AuthedRequest) {
    return this.assetsQueueService.updateType({
      id,
      ...dto,
      ...assetActor(req),
    });
  }

  @Delete(':id')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Delete an asset type' })
  @ApiParam({ name: 'id', description: 'Type ID' })
  async deleteType(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.assetsQueueService.deleteType({
      id,
      ...assetActor(req),
    });
  }
}

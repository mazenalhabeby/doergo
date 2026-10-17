import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { RequirePermissionInSpace } from '../../common/decorators';
import { AssetsService } from './assets.service';
import { AssetsQueueService } from './assets.queue.service';
import { CreateAssetDto, UpdateAssetDto, AssetQueryDto } from './dto';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { assetActor } from './asset-actor';

import type { AuthedRequest } from '../../common/request.types';
@ApiTags('assets')
@ApiBearerAuth()
/*
  The register is honoured PER WORKSPACE, at three levels — and the guard is
  only the door.

    canViewAssets   — read records, their history, money, custody and logbook
    canLogAssets    — add logbook entries and file expenses
    canManageAssets — create, edit, delete, hand over, money rows, contracts,
                      proposals

  Every gated route is `@RequirePermissionInSpace`: a grant held org-wide OR in
  a workspace opens it. The request names an asset, not a workspace, so the
  guard can only ask "somewhere?" — the SERVICE is the boundary. It reads the
  record's KIND (`AssetCategory.spaceId`; an asset has no workspace of its own)
  and answers 404 outside the caller's workspaces, exactly as for no such
  record. A record whose kind has no workspace is org-level, and only an
  org-wide grant reaches it.

  ⚠️ External members. This controller used to be closed to them outright
  (`@DenyExternal()` on the class), because asset reads rode on
  `canViewAllTasks` — the permission an external supervisor holds to follow
  the work — so granting sight of a site granted the equipment register with
  it. The register has its own keys now, granted on purpose, workspace by
  workspace. So the rule is the one every other workspace surface follows: an
  external member may do in THEIR workspace what their keys allow, and never
  outside it. What stays closed (per route, with the reason) is the
  organization's own custody system for its staff — what I hold, expenses filed
  by custody, proposals — because an external member holds no custody.
*/
/**
 * ⚠️ This had NO module gate. The register itself. Reads pass — an organization that switches Assets off
 * keeps sight of what it recorded; it just cannot add to it.
 *
 * ModuleGuard resolves the space from the request and falls back to the
 * organization's set when there is none, and it passes reads by design.
 */
@RequireModule('assets')
@Controller('assets')
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly assetsQueueService: AssetsQueueService,
  ) {}

  @Post()
  /*
    A WRITE, so it asks the WRITE permission — held org-wide, or in the
    workspace of the KIND it is created in. The service checks the kind's real
    workspace (the body's `spaceId` is a hint for the module gate, never an
    authorisation), and a record with no kind — no workspace at all — is
    refused to anybody short of an org-wide manager.
  */
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Create a new asset' })
  async create(@Body() dto: CreateAssetDto, @Request() req: AuthedRequest) {
    return this.assetsQueueService.create({
      ...dto,
      ...assetActor(req),
    });
  }

  /*
    The organization's register, or one workspace's — narrowed in the service
    to the workspaces the caller may READ. `?spaceId=` is intersected with that,
    never trusted: it can narrow a view and never widen it.
  */
  @Get()
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'List assets — the organization’s, or one workspace’s' })
  async findAll(@Query() query: AssetQueryDto, @Request() req: AuthedRequest) {
    return this.assetsService.findAll({
      ...query,
      ...assetActor(req),
    });
  }

  @Get(':id')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'Get asset by ID' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async findOne(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.assetsService.findOne({
      id,
      ...assetActor(req),
    });
  }

  /*
    Asked of the record's workspace as it is AND of the kind it is moved to —
    moving a record to another kind is moving it to that kind's workspace.
  */
  @Patch(':id')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Update an asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async update(@Param('id') id: string, @Body() dto: UpdateAssetDto, @Request() req: AuthedRequest) {
    return this.assetsQueueService.update({
      id,
      ...dto,
      ...assetActor(req),
    });
  }

  @Delete(':id')
  // Destructive and irreversible: management, in the record's own workspace.
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Delete an asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async delete(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.assetsQueueService.delete({
      id,
      ...assetActor(req),
    });
  }

  @Get(':id/history')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'Get maintenance history for an asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'scope', required: false, enum: ['done', 'all'] })
  async getMaintenanceHistory(
    @Param('id') id: string,
    @Query('page') page: number | undefined,
    @Query('limit') limit: number | undefined,
    @Query('scope') scope: ('done' | 'all') | undefined,
    @Request() req: AuthedRequest,
  ) {
    return this.assetsService.getMaintenanceHistory({
      id,
      page,
      limit,
      scope,
      ...assetActor(req),
    });
  }
}

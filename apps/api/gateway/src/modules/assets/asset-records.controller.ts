import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { RequirePermissionInSpace } from '../../common/decorators';
import { AssetsService } from './assets.service';
import { AssetsQueueService } from './assets.queue.service';
import { AssetListRowDto, UpdateAssetListRowDto } from './dto';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { assetActor } from './asset-actor';

import type { AuthedRequest } from '../../common/request.types';
import { AssetActivityDto, AssetMoneyDto } from './dto/decision-bodies.dto';
/** /assets/:id — an asset's activity, money and rows. */
@ApiTags('assets')
@ApiBearerAuth()
@RequireModule('assets')
@Controller('assets')
export class AssetRecordsController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly assetsQueueService: AssetsQueueService,
  ) {}

  // Both are ':id'-prefixed, so they cannot be swallowed by the ':id' route the
  // way a literal segment would be.
  @Get(':id/activities')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'What happened to this asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async listActivities(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.assetsService.listActivities({
      id,
      ...assetActor(req),
    });
  }

  /*
    A note in the record's history. Management, not logging: the logbook is
    where use, fuel and damage are recorded (`canLogAssets`); the timeline is
    the record's own story, written by whoever runs it.
  */
  @Post(':id/activities')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Write a note against this asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async addActivity(@Param('id') id: string, @Body() body: AssetActivityDto, @Request() req: AuthedRequest) {
    return this.assetsService.addActivity({
      id,
      body: body?.body ?? '',
      ...assetActor(req),
    });
  }

  @Get(':id/money')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'Money logged against this asset, with totals' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async listMoney(@Param('id') id: string, @Query('limit') limit: number, @Request() req: AuthedRequest) {
    return this.assetsService.listMoney({
      id,
      limit,
      ...assetActor(req),
    });
  }

  @Post(':id/money')
  // A money row is RECORDED as it is written — it moves the books with no
  // review — so it is management, not logging (AS-B1). A cost that waits for
  // the office goes through the logbook.
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Log money against this asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async addMoney(@Param('id') id: string, @Body() body: AssetMoneyDto, @Request() req: AuthedRequest) {
    return this.assetsService.addMoney({
      id,
      category: body?.category ?? '',
      amountCents: body?.amountCents ?? 0,
      note: body?.note,
      occurredAt: body?.occurredAt,
      ...assetActor(req),
    });
  }

  @Delete(':id/money/:entryId')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Remove one money entry' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiParam({ name: 'entryId', description: 'Entry ID' })
  async removeMoney(@Param('id') id: string, @Param('entryId') entryId: string, @Request() req: AuthedRequest) {
    return this.assetsService.removeMoney({
      id,
      entryId,
      ...assetActor(req),
    });
  }

  @Get(':id/rows')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'Rows of one table on this asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiQuery({ name: 'list', required: true })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listRows(
    @Param('id') id: string,
    @Query('list') list: string,
    @Query('search') search: string | undefined,
    @Query('page') page: number | undefined,
    @Query('limit') limit: number | undefined,
    @Request() req: AuthedRequest,
  ) {
    return this.assetsService.listRows({
      id,
      list,
      search,
      page,
      limit,
      ...assetActor(req),
    });
  }

  @Post(':id/rows')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: "Add a row to one of this asset's tables" })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async addRow(@Param('id') id: string, @Body() dto: AssetListRowDto, @Request() req: AuthedRequest) {
    return this.assetsService.addRow({
      id,
      list: dto.list,
      values: dto.values,
      ...assetActor(req),
    });
  }

  @Patch(':id/rows/:rowId')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Change one row' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiParam({ name: 'rowId', description: 'Row ID' })
  async updateRow(
    @Param('id') id: string,
    @Param('rowId') rowId: string,
    @Body() dto: UpdateAssetListRowDto,
    @Request() req: AuthedRequest,
  ) {
    return this.assetsService.updateRow({
      id,
      rowId,
      values: dto.values,
      ...assetActor(req),
    });
  }

  @Delete(':id/rows/:rowId')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Remove one row' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiParam({ name: 'rowId', description: 'Row ID' })
  async removeRow(@Param('id') id: string, @Param('rowId') rowId: string, @Request() req: AuthedRequest) {
    return this.assetsService.removeRow({
      id,
      rowId,
      ...assetActor(req),
    });
  }
}

import { Controller, Get, Post, Delete, Body, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { RequirePermissionInSpace } from '../../common/decorators';
import { AssetsService } from './assets.service';
import { HandOverDto, CreateLogEntryDto, LogPresignDto, LogListQueryDto, LogSummaryQueryDto } from './dto';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { assetActor } from './asset-actor';

import type { AuthedRequest } from '../../common/request.types';
/** /assets/:id — custody (who holds it, handing it over) and its logbook. */
@ApiTags('assets')
@ApiBearerAuth()
@RequireModule('assets')
@Controller('assets')
export class AssetCustodyController {
  constructor(
    private readonly assetsService: AssetsService,
  ) {}

  /*
    Who has held this, and what it cost each of them.

    The costs are NOT stored against a holder — every entry carries the date the
    money moved, and the split is computed from the periods. Two versions of
    that truth would disagree the first time somebody corrected a handover date.
  */
  @Get(':id/custody')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'Who has held this, and what it cost them' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async custody(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.assetsService.custodyTimeline({
      id,
      ...assetActor(req),
    });
  }

  /*
    Hand it to somebody — or take it back, by sending nobody.

    Reassigning a record of the workspace is managing it, so an external
    manager may do it in their workspace like any space manager. The record's
    workspace decides, in the service.
  */
  @Post(':id/custody')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Hand this over' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async handOver(@Param('id') id: string, @Body() dto: HandOverDto, @Request() req: AuthedRequest) {
    return this.assetsService.custodyHandOver({
      id,
      ...dto,
      ...assetActor(req),
    });
  }

  // ============================================
  // LOGBOOK — what gets done to a thing, and when it is due again
  // ============================================

  /*
    Reading one asset's log. `InSpace` widens the door to whoever may read the
    asset's workspace; the SERVICE checks the asset's own space, which is the
    boundary — the guard cannot know an asset's space from its id.
  */
  @Get(':id/log')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'The logbook of one asset, newest first' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async listLog(@Param('id') id: string, @Query() query: LogListQueryDto, @Request() req: AuthedRequest) {
    return this.assetsService.logList({ id, ...query, ...assetActor(req) });
  }

  @Get(':id/log/summary')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'Latest readings, next due, and who spent what in a period' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async logSummary(@Param('id') id: string, @Query() query: LogSummaryQueryDto, @Request() req: AuthedRequest) {
    return this.assetsService.logSummary({ id, ...query, ...assetActor(req) });
  }

  /*
    Filing an entry, and the upload link for its photo.

    ⚠️ NO PERMISSION DECORATOR, exactly like the expense routes: a driver files
    fuel against the van they HELD that day, which is a fact about custody the
    service checks — a permission here would lock out everybody the logbook
    exists for. A type that is not holder-only is also open to whoever holds
    `canLogAssets` in the record's workspace (the colleague who noticed the
    dent), and the office (`canManageAssets` there) logs anything — all three
    decided in the service.

    OPEN to an external member: `canLogAssets` in their workspace is exactly
    the key that lets them log there. They never pass on custody — the service
    refuses that path for an external member outright.
  */
  @Post(':id/log/presign')
  @ApiOperation({ summary: 'Upload URL for a logbook photo' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async presignLog(@Param('id') id: string, @Body() dto: LogPresignDto, @Request() req: AuthedRequest) {
    return this.assetsService.logPresign({ id, ...dto, ...assetActor(req) });
  }

  @Post(':id/log')
  @ApiOperation({ summary: 'Log something done to this asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async createLog(@Param('id') id: string, @Body() dto: CreateLogEntryDto, @Request() req: AuthedRequest) {
    return this.assetsService.logCreate({ id, ...dto, ...assetActor(req) });
  }

  /*
    Remove an entry. No decorator: an author may WITHDRAW their own while it is
    still waiting, and only the office — `canManageAssets` in the record's
    workspace — removes anything else; both decided in the service, which
    knows whose entry it is and its status.
  */
  @Delete(':id/log/:entryId')
  @ApiOperation({ summary: 'Remove a logbook entry' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiParam({ name: 'entryId', description: 'Entry ID' })
  async removeLog(@Param('id') id: string, @Param('entryId') entryId: string, @Request() req: AuthedRequest) {
    return this.assetsService.logRemove({ id, entryId, ...assetActor(req) });
  }
}

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
  CreateAssetDto, UpdateAssetDto, AssetQueryDto, AssetListRowDto, UpdateAssetListRowDto,
} from './dto';

@ApiTags('assets')
@ApiBearerAuth()
@Controller('assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly assetsQueueService: AssetsQueueService,
  ) {}

  @Post()
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Create a new asset' })
  async create(@Body() dto: CreateAssetDto, @Request() req: any) {
    return this.assetsQueueService.create({
      ...dto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get()
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'List all assets' })
  async findAll(@Query() query: AssetQueryDto, @Request() req: any) {
    return this.assetsService.findAll({
      ...query,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  /*
    Declared BEFORE `:id`, and it has to stay there.

    Express matches in declaration order, so a static segment placed after a
    parameter route is never reached — `/assets/usage` would be read as an asset
    whose id is "usage" and answer 404. It has happened here before; the test in
    __tests__/route-order.spec.ts exists to stop it happening again.
  */
  @Get('usage')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: "How many assets this organization is billed for" })
  @ApiQuery({ name: 'spaceId', required: false, description: "Also return that space's own share of the count" })
  async billingUsage(@Query('spaceId') spaceId: string | undefined, @Request() req: any) {
    return this.assetsService.billingUsage({
      organizationId: req.user.organizationId,
      // A space id from the URL only ever narrows a count already scoped to the
      // caller's org, so a foreign id returns zero rather than anything leaking.
      spaceId: spaceId || null,
    });
  }

  @Get(':id')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get asset by ID' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.findOne({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Update an asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
    @Request() req: any,
  ) {
    return this.assetsQueueService.update({
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
  @ApiOperation({ summary: 'Delete an asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.assetsQueueService.delete({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  // Both are ':id'-prefixed, so they cannot be swallowed by the ':id' route the
  // way a literal segment would be.
  @Get(':id/activities')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'What happened to this asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async listActivities(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.listActivities({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/activities')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Write a note against this asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async addActivity(
    @Param('id') id: string,
    @Body() body: { body?: string },
    @Request() req: any,
  ) {
    return this.assetsService.addActivity({
      id,
      body: body?.body ?? '',
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/money')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Money logged against this asset, with totals' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async listMoney(@Param('id') id: string, @Query('limit') limit: number, @Request() req: any) {
    return this.assetsService.listMoney({
      id,
      limit,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/money')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Log money against this asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async addMoney(
    @Param('id') id: string,
    @Body() body: { category?: string; amountCents?: number; note?: string; occurredAt?: string },
    @Request() req: any,
  ) {
    return this.assetsService.addMoney({
      id,
      category: body?.category ?? '',
      amountCents: body?.amountCents ?? 0,
      note: body?.note,
      occurredAt: body?.occurredAt,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id/money/:entryId')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Remove one money entry' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiParam({ name: 'entryId', description: 'Entry ID' })
  async removeMoney(@Param('id') id: string, @Param('entryId') entryId: string, @Request() req: any) {
    return this.assetsService.removeMoney({
      id,
      entryId,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/rows')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Rows of one table on this asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiQuery({ name: 'list', required: true })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listRows(
    @Param('id') id: string,
    @Query('list') list: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ) {
    return this.assetsService.listRows({
      id, list, search, page, limit,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/rows')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Add a row to one of this asset\'s tables' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async addRow(@Param('id') id: string, @Body() dto: AssetListRowDto, @Request() req: any) {
    return this.assetsService.addRow({
      id,
      list: dto.list,
      values: dto.values,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id/rows/:rowId')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Change one row' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiParam({ name: 'rowId', description: 'Row ID' })
  async updateRow(
    @Param('id') id: string,
    @Param('rowId') rowId: string,
    @Body() dto: UpdateAssetListRowDto,
    @Request() req: any,
  ) {
    return this.assetsService.updateRow({
      id, rowId,
      values: dto.values,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id/rows/:rowId')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Remove one row' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiParam({ name: 'rowId', description: 'Row ID' })
  async removeRow(@Param('id') id: string, @Param('rowId') rowId: string, @Request() req: any) {
    return this.assetsService.removeRow({
      id, rowId,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/structure')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: "This record's parts, and the path back up" })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async structure(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.structure({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id/parent')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Put this record inside another, or back at the top' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async setParent(
    @Param('id') id: string,
    @Body() body: { parentId?: string | null },
    @Request() req: any,
  ) {
    return this.assetsService.setParent({
      id,
      parentId: body?.parentId ?? null,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/history')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get maintenance history for an asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'scope', required: false, enum: ['done', 'all'] })
  async getMaintenanceHistory(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('scope') scope?: 'done' | 'all',
    @Request() req?: any,
  ) {
    return this.assetsService.getMaintenanceHistory({
      id,
      page,
      limit,
      scope,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }
}

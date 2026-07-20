import { Controller, Get, Post, Patch, Delete, Body, Param, Inject, Request } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { RequirePermission } from '../../common/decorators';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(@Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy) {}

  @Get('catalog')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Report builder catalog: datasets (dimensions/measures) + templates' })
  async catalog() {
    return firstValueFrom(this.taskClient.send({ cmd: 'analytics_catalog' }, {}));
  }

  @Post('run')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Run a report definition (always scoped to your organization)' })
  async run(@Body() body: { definition: unknown }, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'analytics_run' }, {
        organizationId: req.user.organizationId,
        definition: body?.definition,
      }),
    );
  }

  // ── Saved reports (custom builder). View = all tiers; build = Pro+. ──────────
  @Get('reports')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'List saved reports (org-shared + your own)' })
  async listSaved(@Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'analytics_list_saved' }, { organizationId: req.user.organizationId, userId: req.user.id }),
    );
  }

  @Post('reports')
  @RequirePermission('canViewAllTasks')
  @RequirePlan('reports_builder')
  @ApiOperation({ summary: 'Save a custom report (Pro+)' })
  async createSaved(@Body() body: { name: string; description?: string; config: unknown; isShared?: boolean }, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'analytics_create_saved' }, {
        organizationId: req.user.organizationId, userId: req.user.id,
        name: body?.name, description: body?.description, config: body?.config, isShared: body?.isShared,
      }),
    );
  }

  @Patch('reports/:id')
  @RequirePermission('canViewAllTasks')
  @RequirePlan('reports_builder')
  @ApiOperation({ summary: 'Update a saved report (Pro+)' })
  async updateSaved(@Param('id') id: string, @Body() body: { name?: string; description?: string; config?: unknown; isShared?: boolean }, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'analytics_update_saved' }, {
        id, organizationId: req.user.organizationId, userId: req.user.id,
        name: body?.name, description: body?.description, config: body?.config, isShared: body?.isShared,
      }),
    );
  }

  @Delete('reports/:id')
  @RequirePermission('canViewAllTasks')
  @RequirePlan('reports_builder')
  @ApiOperation({ summary: 'Delete a saved report (Pro+)' })
  async deleteSaved(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send({ cmd: 'analytics_delete_saved' }, { id, organizationId: req.user.organizationId }),
    );
  }
}

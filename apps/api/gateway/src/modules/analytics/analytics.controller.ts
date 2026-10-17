import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  Request,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { SERVICE_NAMES, isAdmin } from '@hbcfield/shared';
import { RequirePlan } from '../../common/decorators/require-plan.decorator';
import { DenyExternal } from '../../common/decorators/deny-external.decorator';
import { ReportAccessGuard, reportSpaceScope } from '../../common/guards/report-access.guard';

/**
 * A scheduled delivery runs with NO reader — on a timer, mailed to addresses.
 * It cannot be narrowed to a person's workspaces at send time, so only a reader
 * who already sees the whole organization's figures may set one up or change
 * it; otherwise a supervisor of one site schedules the org-wide report to
 * their own inbox.
 */
function assertOrgWideReports(req: any): void {
  if (reportSpaceScope(req.user) !== null) {
    throw new ForbiddenException('Scheduling reports needs access to reports across the whole organization');
  }
}

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
/*
  The organization's figures — every person's hours, leave and jobs. An
  external member holds canViewAllTasks in their space to follow the work they
  supervise; that is not a claim on the organization's reports.
*/
@DenyExternal()
@UseGuards(ReportAccessGuard) // admin OR canViewAllTasks OR canViewReports — narrowed by reportSpaceScope
export class AnalyticsController {
  constructor(@Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Report builder catalog: datasets (dimensions/measures) + templates' })
  async catalog() {
    return firstValueFrom(this.taskClient.send({ cmd: 'analytics_catalog' }, {}));
  }

  @Post('run')
  @ApiOperation({ summary: 'Run a report definition (always scoped to your organization)' })
  async run(@Body() body: { definition: unknown }, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'analytics_run' },
        {
          organizationId: req.user.organizationId,
          definition: body?.definition,
          scopeSpaceIds: reportSpaceScope(req.user),
        },
      ),
    );
  }

  @Get('timesheet')
  @ApiOperation({ summary: 'Detailed daily timesheet for one user (calendar with clock-in/out, leave, days off)' })
  async timesheet(
    @Request() req: any,
    @Query('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'analytics_timesheet' },
        {
          organizationId: req.user.organizationId,
          userId: typeof userId === 'string' ? userId : '',
          from,
          to,
          scopeSpaceIds: reportSpaceScope(req.user),
        },
      ),
    );
  }

  // ── Saved reports (custom builder). View = all tiers; build = Pro+. ──────────
  @Get('reports')
  @ApiOperation({ summary: 'List saved reports (org-shared + your own)' })
  async listSaved(@Request() req: any) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'analytics_list_saved' },
        { organizationId: req.user.organizationId, userId: req.user.id },
      ),
    );
  }

  @Post('reports')
  @RequirePlan('reports_builder')
  @ApiOperation({ summary: 'Save a custom report (Pro+)' })
  async createSaved(
    @Body() body: { name: string; description?: string; config: unknown; isShared?: boolean },
    @Request() req: any,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'analytics_create_saved' },
        {
          organizationId: req.user.organizationId,
          userId: req.user.id,
          name: body?.name,
          description: body?.description,
          config: body?.config,
          isShared: body?.isShared,
        },
      ),
    );
  }

  @Patch('reports/:id')
  @RequirePlan('reports_builder')
  @ApiOperation({ summary: 'Update a saved report (Pro+)' })
  async updateSaved(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; config?: unknown; isShared?: boolean },
    @Request() req: any,
  ) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'analytics_update_saved' },
        {
          id,
          organizationId: req.user.organizationId,
          userId: req.user.id,
          isAdmin: isAdmin(req.user),
          name: body?.name,
          description: body?.description,
          config: body?.config,
          isShared: body?.isShared,
        },
      ),
    );
  }

  @Delete('reports/:id')
  @RequirePlan('reports_builder')
  @ApiOperation({ summary: 'Delete a saved report (Pro+)' })
  async deleteSaved(@Param('id') id: string, @Request() req: any) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'analytics_delete_saved' },
        { id, organizationId: req.user.organizationId, userId: req.user.id, isAdmin: isAdmin(req.user) },
      ),
    );
  }

  // ── Scheduled delivery (Business+). Reads open; mutations gated. ─────────────
  @Get('schedules')
  @ApiOperation({ summary: 'List report delivery schedules' })
  async listSchedules(@Request() req: any, @Query('reportId') reportId?: string) {
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'analytics_list_schedules' },
        { organizationId: req.user.organizationId, reportDefinitionId: reportId },
      ),
    );
  }

  @Post('schedules')
  @RequirePlan('report_scheduling')
  @ApiOperation({ summary: 'Schedule a report for email delivery (Business+)' })
  async createSchedule(@Body() body: any, @Request() req: any) {
    assertOrgWideReports(req);
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'analytics_create_schedule' },
        { ...body, organizationId: req.user.organizationId, userId: req.user.id },
      ),
    );
  }

  @Patch('schedules/:id')
  @RequirePlan('report_scheduling')
  @ApiOperation({ summary: 'Update a report schedule (Business+)' })
  async updateSchedule(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    assertOrgWideReports(req);
    return firstValueFrom(
      this.taskClient.send(
        { cmd: 'analytics_update_schedule' },
        { ...body, id, organizationId: req.user.organizationId },
      ),
    );
  }

  @Delete('schedules/:id')
  @RequirePlan('report_scheduling')
  @ApiOperation({ summary: 'Delete a report schedule (Business+)' })
  async deleteSchedule(@Param('id') id: string, @Request() req: any) {
    assertOrgWideReports(req);
    return firstValueFrom(
      this.taskClient.send({ cmd: 'analytics_delete_schedule' }, { id, organizationId: req.user.organizationId }),
    );
  }
}

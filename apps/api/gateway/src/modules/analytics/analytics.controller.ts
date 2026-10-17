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
import {
  pattern,
  analyticsCatalog,
  analyticsCreateSaved,
  analyticsCreateSchedule,
  analyticsDeleteSaved,
  analyticsDeleteSchedule,
  analyticsListSaved,
  analyticsListSchedules,
  analyticsRun,
  analyticsTimesheet,
  analyticsUpdateSaved,
  analyticsUpdateSchedule,
  type ReportDefinitionMessage,
  type RpcRequest,
} from '@hbcfield/shared/microservices';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
/*
  ⚠️ Contract mismatch, kept as it is: the definition is the request body, unchecked
  here — the service's query engine refuses an unknown dataset, dimension or measure.
*/
const definitionFromBody = (v: unknown) => v as ReportDefinitionMessage;

/**
 * A scheduled delivery runs with NO reader — on a timer, mailed to addresses.
 * It cannot be narrowed to a person's workspaces at send time, so only a reader
 * who already sees the whole organization's figures may set one up or change
 * it; otherwise a supervisor of one site schedules the org-wide report to
 * their own inbox.
 */
function assertOrgWideReports(req: AuthedRequest): void {
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
    return firstValueFrom(
      this.taskClient.send(pattern(analyticsCatalog), {} satisfies RpcRequest<typeof analyticsCatalog>),
    );
  }

  @Post('run')
  @ApiOperation({ summary: 'Run a report definition (always scoped to your organization)' })
  async run(@Body() body: { definition: unknown }, @Request() req: AuthedRequest) {
    return firstValueFrom(
      this.taskClient.send(pattern(analyticsRun), {
        organizationId: callerOrgId(req.user),
        definition: definitionFromBody(body?.definition),
        scopeSpaceIds: reportSpaceScope(req.user),
      } satisfies RpcRequest<typeof analyticsRun>),
    );
  }

  @Get('timesheet')
  @ApiOperation({ summary: 'Detailed daily timesheet for one user (calendar with clock-in/out, leave, days off)' })
  async timesheet(
    @Request() req: AuthedRequest,
    @Query('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return firstValueFrom(
      this.taskClient.send(pattern(analyticsTimesheet), {
        organizationId: callerOrgId(req.user),
        userId: typeof userId === 'string' ? userId : '',
        from,
        to,
        scopeSpaceIds: reportSpaceScope(req.user),
      } satisfies RpcRequest<typeof analyticsTimesheet>),
    );
  }

  // ── Saved reports (custom builder). View = all tiers; build = Pro+. ──────────
  @Get('reports')
  @ApiOperation({ summary: 'List saved reports (org-shared + your own)' })
  async listSaved(@Request() req: AuthedRequest) {
    return firstValueFrom(
      this.taskClient.send(pattern(analyticsListSaved), {
        organizationId: callerOrgId(req.user),
        userId: req.user.id,
      } satisfies RpcRequest<typeof analyticsListSaved>),
    );
  }

  @Post('reports')
  @RequirePlan('reports_builder')
  @ApiOperation({ summary: 'Save a custom report (Pro+)' })
  async createSaved(
    @Body() body: { name: string; description?: string; config: unknown; isShared?: boolean },
    @Request() req: AuthedRequest,
  ) {
    return firstValueFrom(
      this.taskClient.send(pattern(analyticsCreateSaved), {
        organizationId: callerOrgId(req.user),
        userId: req.user.id,
        name: body?.name,
        description: body?.description,
        config: definitionFromBody(body?.config),
        isShared: body?.isShared,
      } satisfies RpcRequest<typeof analyticsCreateSaved>),
    );
  }

  @Patch('reports/:id')
  @RequirePlan('reports_builder')
  @ApiOperation({ summary: 'Update a saved report (Pro+)' })
  async updateSaved(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; config?: unknown; isShared?: boolean },
    @Request() req: AuthedRequest,
  ) {
    return firstValueFrom(
      this.taskClient.send(pattern(analyticsUpdateSaved), {
        id,
        organizationId: callerOrgId(req.user),
        userId: req.user.id,
        isAdmin: isAdmin(req.user),
        name: body?.name,
        description: body?.description,
        config: definitionFromBody(body?.config),
        isShared: body?.isShared,
      } satisfies RpcRequest<typeof analyticsUpdateSaved>),
    );
  }

  @Delete('reports/:id')
  @RequirePlan('reports_builder')
  @ApiOperation({ summary: 'Delete a saved report (Pro+)' })
  async deleteSaved(@Param('id') id: string, @Request() req: AuthedRequest) {
    return firstValueFrom(
      this.taskClient.send(pattern(analyticsDeleteSaved), {
        id,
        organizationId: callerOrgId(req.user),
        userId: req.user.id,
        isAdmin: isAdmin(req.user),
      } satisfies RpcRequest<typeof analyticsDeleteSaved>),
    );
  }

  // ── Scheduled delivery (Business+). Reads open; mutations gated. ─────────────
  @Get('schedules')
  @ApiOperation({ summary: 'List report delivery schedules' })
  async listSchedules(@Request() req: AuthedRequest, @Query('reportId') reportId?: string) {
    return firstValueFrom(
      this.taskClient.send(pattern(analyticsListSchedules), {
        organizationId: callerOrgId(req.user),
        reportDefinitionId: reportId,
      } satisfies RpcRequest<typeof analyticsListSchedules>),
    );
  }

  @Post('schedules')
  @RequirePlan('report_scheduling')
  @ApiOperation({ summary: 'Schedule a report for email delivery (Business+)' })
  async createSchedule(
    @Body() body: Omit<RpcRequest<typeof analyticsCreateSchedule>, 'organizationId' | 'userId'>,
    @Request() req: AuthedRequest,
  ) {
    assertOrgWideReports(req);
    return firstValueFrom(
      this.taskClient.send(pattern(analyticsCreateSchedule), {
        ...body,
        organizationId: callerOrgId(req.user),
        userId: req.user.id,
      } satisfies RpcRequest<typeof analyticsCreateSchedule>),
    );
  }

  @Patch('schedules/:id')
  @RequirePlan('report_scheduling')
  @ApiOperation({ summary: 'Update a report schedule (Business+)' })
  async updateSchedule(
    @Param('id') id: string,
    @Body() body: Omit<RpcRequest<typeof analyticsUpdateSchedule>, 'id' | 'organizationId'>,
    @Request() req: AuthedRequest,
  ) {
    assertOrgWideReports(req);
    return firstValueFrom(
      this.taskClient.send(pattern(analyticsUpdateSchedule), {
        ...body,
        id,
        organizationId: callerOrgId(req.user),
      } satisfies RpcRequest<typeof analyticsUpdateSchedule>),
    );
  }

  @Delete('schedules/:id')
  @RequirePlan('report_scheduling')
  @ApiOperation({ summary: 'Delete a report schedule (Business+)' })
  async deleteSchedule(@Param('id') id: string, @Request() req: AuthedRequest) {
    assertOrgWideReports(req);
    return firstValueFrom(
      this.taskClient.send(pattern(analyticsDeleteSchedule), {
        id,
        organizationId: callerOrgId(req.user),
      } satisfies RpcRequest<typeof analyticsDeleteSchedule>),
    );
  }
}

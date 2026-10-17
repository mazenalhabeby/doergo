import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AnalyticsService } from './analytics.service';
import { ReportScheduleService } from './report-schedule.service';
import { ReportDefinition } from './query-engine';
import type { SpaceScopeIds } from '@hbcfield/shared';
import { SavedReportsService } from './saved-reports.service';

@Controller()
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly savedReports: SavedReportsService,
    private readonly schedules: ReportScheduleService,
  ) {}

  @MessagePattern({ cmd: 'analytics_catalog' })
  catalog() {
    return this.analytics.getCatalog();
  }

  @MessagePattern({ cmd: 'analytics_run' })
  run(@Payload() data: { organizationId: string; definition: ReportDefinition; scopeSpaceIds?: SpaceScopeIds }) {
    return this.analytics.run(data);
  }

  @MessagePattern({ cmd: 'analytics_timesheet' })
  timesheet(
    @Payload()
    data: {
      organizationId: string;
      userId: string;
      from?: string;
      to?: string;
      scopeSpaceIds?: SpaceScopeIds;
    },
  ) {
    return this.analytics.timesheetDetail(data);
  }

  @MessagePattern({ cmd: 'analytics_list_saved' })
  listSaved(@Payload() data: { organizationId: string; userId: string }) {
    return this.savedReports.listSaved(data);
  }

  @MessagePattern({ cmd: 'analytics_create_saved' })
  createSaved(
    @Payload()
    data: {
      organizationId: string;
      userId: string;
      name: string;
      description?: string;
      config: ReportDefinition;
      isShared?: boolean;
    },
  ) {
    return this.savedReports.createSaved(data);
  }

  @MessagePattern({ cmd: 'analytics_update_saved' })
  updateSaved(
    @Payload()
    data: {
      id: string;
      organizationId: string;
      userId: string;
      isAdmin?: boolean;
      name?: string;
      description?: string;
      config?: ReportDefinition;
      isShared?: boolean;
    },
  ) {
    return this.savedReports.updateSaved(data);
  }

  @MessagePattern({ cmd: 'analytics_delete_saved' })
  deleteSaved(@Payload() data: { id: string; organizationId: string; userId?: string; isAdmin?: boolean }) {
    return this.savedReports.deleteSaved(data);
  }

  // ── Schedules ───────────────────────────────────────────────────────────────
  @MessagePattern({ cmd: 'analytics_list_schedules' })
  listSchedules(@Payload() data: { organizationId: string; reportDefinitionId?: string }) {
    return this.schedules.list(data);
  }

  @MessagePattern({ cmd: 'analytics_create_schedule' })
  createSchedule(@Payload() data: any) {
    return this.schedules.create(data);
  }

  @MessagePattern({ cmd: 'analytics_update_schedule' })
  updateSchedule(@Payload() data: any) {
    return this.schedules.update(data);
  }

  @MessagePattern({ cmd: 'analytics_delete_schedule' })
  deleteSchedule(@Payload() data: { id: string; organizationId: string }) {
    return this.schedules.remove(data);
  }
}

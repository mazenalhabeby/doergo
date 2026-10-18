import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
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
  type RpcRequest,
} from '@hbcfield/shared/microservices';
import { AnalyticsService } from './analytics.service';
import { ReportScheduleService } from './report-schedule.service';
import { SavedReportsService } from './saved-reports.service';

@Controller()
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly savedReports: SavedReportsService,
    private readonly schedules: ReportScheduleService,
  ) {}

  @MessagePattern(pattern(analyticsCatalog))
  catalog() {
    return this.analytics.getCatalog();
  }

  @MessagePattern(pattern(analyticsRun))
  run(@Payload() data: RpcRequest<typeof analyticsRun>) {
    return this.analytics.run(data);
  }

  @MessagePattern(pattern(analyticsTimesheet))
  timesheet(
    @Payload()
    data: RpcRequest<typeof analyticsTimesheet>,
  ) {
    return this.analytics.timesheetDetail(data);
  }

  @MessagePattern(pattern(analyticsListSaved))
  listSaved(@Payload() data: RpcRequest<typeof analyticsListSaved>) {
    return this.savedReports.listSaved(data);
  }

  @MessagePattern(pattern(analyticsCreateSaved))
  createSaved(
    @Payload()
    data: RpcRequest<typeof analyticsCreateSaved>,
  ) {
    return this.savedReports.createSaved(data);
  }

  @MessagePattern(pattern(analyticsUpdateSaved))
  updateSaved(
    @Payload()
    data: RpcRequest<typeof analyticsUpdateSaved>,
  ) {
    return this.savedReports.updateSaved(data);
  }

  @MessagePattern(pattern(analyticsDeleteSaved))
  deleteSaved(@Payload() data: RpcRequest<typeof analyticsDeleteSaved>) {
    return this.savedReports.deleteSaved(data);
  }

  // ── Schedules ───────────────────────────────────────────────────────────────
  @MessagePattern(pattern(analyticsListSchedules))
  listSchedules(@Payload() data: RpcRequest<typeof analyticsListSchedules>) {
    return this.schedules.list(data);
  }

  @MessagePattern(pattern(analyticsCreateSchedule))
  createSchedule(@Payload() data: RpcRequest<typeof analyticsCreateSchedule>) {
    return this.schedules.create(data);
  }

  @MessagePattern(pattern(analyticsUpdateSchedule))
  updateSchedule(@Payload() data: RpcRequest<typeof analyticsUpdateSchedule>) {
    return this.schedules.update(data);
  }

  @MessagePattern(pattern(analyticsDeleteSchedule))
  deleteSchedule(@Payload() data: RpcRequest<typeof analyticsDeleteSchedule>) {
    return this.schedules.remove(data);
  }
}

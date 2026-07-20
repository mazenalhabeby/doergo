import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ReportScheduleService } from './report-schedule.service';

@Module({
  imports: [
    // Outbound client so the scheduler can email rendered reports.
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, ReportScheduleService],
})
export class AnalyticsModule {}

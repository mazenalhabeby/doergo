import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientsModule } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import {
  SERVICE_NAMES,
  createClientOptions,
  createBullMQConfig,
  QUEUE_NAMES,
} from '@hbcfield/shared';
import { PrismaModule } from './common/prisma/prisma.module';
import { WorkflowCacheModule } from './common/cache/workflow-cache.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { NotificationRoutingModule } from './common/notification-routing.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AssetsModule } from './modules/assets/assets.module';
import { ReportsModule } from './modules/reports/reports.module';
import { LocationsModule } from './modules/locations/locations.module';
import { SearchModule } from './modules/search/search.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { SpaceRolesModule } from './modules/space-roles/space-roles.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { OvertimeModule } from './modules/overtime/overtime.module';
import { TechniciansModule } from './modules/technicians/technicians.module';
import { PhasesModule } from './modules/phases/phases.module';
import { SprintsModule } from './modules/sprints/sprints.module';
import { EpicsModule } from './modules/epics/epics.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { CustomFieldsModule } from './modules/custom-fields/custom-fields.module';
import { RecurringTasksModule } from './modules/recurring-tasks/recurring-tasks.module';
import { SupportModule } from './modules/support/support.module';
import { ChatModule } from './modules/chat/chat.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { WorklogModule } from './modules/worklog/worklog.module';
import { ShiftIssuesModule } from './modules/shift-issues/shift-issues.module';
import { RetentionService } from './common/retention/retention.service';

@Module({
  imports: [
    // Global: one routing service (and one cache) for the whole process.
    NotificationRoutingModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    // BullMQ for job processing
    BullModule.forRootAsync(createBullMQConfig()),
    BullModule.registerQueue({
      name: QUEUE_NAMES.TASKS,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAMES.ASSETS,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAMES.REPORTS,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAMES.LOCATIONS,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAMES.ATTENDANCE,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAMES.SUPPORT,
    }),
    // Client for notification service (to emit events)
    ClientsModule.registerAsync([
      createClientOptions(SERVICE_NAMES.NOTIFICATION),
    ]),
    PrismaModule,
    WorkflowCacheModule,
    TasksModule,
    AttachmentsModule,
    AssetsModule,
    ReportsModule,
    LocationsModule,
    SearchModule,
    AttendanceModule,
    SpaceRolesModule,
    ShiftsModule,
    OvertimeModule,
    TechniciansModule,
    PhasesModule,
    SprintsModule,
    EpicsModule,
    WorkflowsModule,
    CustomFieldsModule,
    RecurringTasksModule,
    SupportModule,
    ChatModule,
    AnalyticsModule,
    WorklogModule,
    ShiftIssuesModule,
  ],
  providers: [RetentionService],
})
export class AppModule {}

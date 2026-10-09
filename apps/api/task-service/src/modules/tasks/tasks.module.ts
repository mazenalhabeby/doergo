import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TASK_SERVICE_PARTS } from './task-service-parts';
import { DepartureReminderService } from './departure-reminder.service';
import { LeaderAbsentService } from './leader-absent.service';
import { TasksProcessor } from './tasks.processor';
import { AttachmentsModule } from '../attachments/attachments.module';
import { ReportsModule } from '../reports/reports.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { TaskReportService } from './task-report.service';

import { PresenceModule } from '../attendance/presence/presence.module';
import { HandoverModule } from './handover/handover.module';
import { RolePoolService } from './role-pool.service';
import { TechniciansModule } from '../technicians/technicians.module';

@Module({
  imports: [
    ClientsModule.registerAsync([
      createClientOptions(SERVICE_NAMES.NOTIFICATION),
      // Step forms write their CRM fields through auth-service's own activity path.
      createClientOptions(SERVICE_NAMES.AUTH),
    ]),
    AttachmentsModule,
    // The job report composes the service report and the custom-field values.
    ReportsModule,
    CustomFieldsModule,
    PresenceModule,
    HandoverModule,
    TechniciansModule, // CoverService: who is rostered and on leave today
  ],
  controllers: [TasksController], // Keep for backwards compatibility (Redis pub/sub)
  providers: [
    TasksService,
    ...TASK_SERVICE_PARTS, // the collaborators behind the TasksService facade
    TasksProcessor, // BullMQ processor for exactly-once job processing
    DepartureReminderService, // sweep: tells a member when to set off
    LeaderAbsentService, // sweep: tells the office a job's leader is off today
    RolePoolService, // a task open to a WORK role: offers in waves, the first to take it gets it
    /*
      The full report for one job. Beside the facade, not one of its parts: it
      composes services from OTHER modules (reports, attachments, custom fields),
      which TASK_SERVICE_PARTS and every test built from it should not need.
    */
    TaskReportService,
  ],
  exports: [TasksService, RolePoolService],
})
export class TasksModule {}

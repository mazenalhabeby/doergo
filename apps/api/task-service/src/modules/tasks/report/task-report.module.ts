import { Module } from '@nestjs/common';
import { TaskCoreModule } from '../core/task-core.module';
import { TaskQueryModule } from '../query/task-query.module';
import { TaskChecklistModule } from '../checklist/task-checklist.module';
import { HandoverModule } from '../handover/handover.module';
import { AttachmentsModule } from '../../attachments/attachments.module';
import { ReportsModule } from '../../reports/reports.module';
import { CustomFieldsModule } from '../../custom-fields/custom-fields.module';
import { TaskReportService } from './task-report.service';

/**
 * The full report for one job (office / client copy). It composes the job's own reads with services
 * of OTHER modules — reports, attachments, custom fields.
 */
@Module({
  imports: [
    TaskCoreModule,
    TaskQueryModule,
    TaskChecklistModule,
    HandoverModule,
    AttachmentsModule,
    ReportsModule,
    CustomFieldsModule,
  ],
  providers: [TaskReportService],
  exports: [TaskReportService],
})
export class TaskReportModule {}

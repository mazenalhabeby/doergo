import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { TaskCoreModule } from '../core/task-core.module';
import { TaskAssignmentModule } from '../assignment/task-assignment.module';
import { TaskRecordsService } from './task-records.service';
import { TaskUpdateService } from './task-update.service';
import { WorkflowResyncService } from './workflow-resync.service';
import { TaskHierarchyService } from './task-hierarchy.service';
import { TaskDependenciesService } from './task-dependencies.service';
import { TaskPortalService } from './task-portal.service';
import { TaskTriageService } from './task-triage.service';

/**
 * A job as a record: create, edit, delete, re-sync a workspace onto its workflow, parents and
 * dependencies, and the client portal's requests (list, triage into work).
 */
@Module({
  imports: [
    TaskCoreModule,
    TaskAssignmentModule,
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
  ],
  providers: [
    TaskRecordsService,
    TaskUpdateService,
    WorkflowResyncService,
    TaskHierarchyService,
    TaskDependenciesService,
    TaskPortalService,
    TaskTriageService,
  ],
  exports: [
    TaskRecordsService,
    TaskUpdateService,
    WorkflowResyncService,
    TaskHierarchyService,
    TaskDependenciesService,
    TaskPortalService,
    TaskTriageService,
  ],
})
export class TaskRecordsModule {}

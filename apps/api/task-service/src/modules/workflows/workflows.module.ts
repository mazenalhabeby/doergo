import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowLibraryService } from './workflow-library.service';
import { WorkflowStatusesService } from './workflow-statuses.service';
import { DefinitionOfDoneService } from './definition-of-done.service';
import { SpaceWorkflowsService } from './space-workflows.service';
import { WorkflowSharingService } from './workflow-sharing.service';
import { LibraryCurationService } from './library-curation.service';

@Module({
  controllers: [WorkflowsController],
  providers: [
    WorkflowsService,
    WorkflowStatusesService,
    DefinitionOfDoneService,
    SpaceWorkflowsService,
    WorkflowSharingService,
    WorkflowLibraryService,
    LibraryCurationService,
  ],
  exports: [
    WorkflowsService,
    WorkflowStatusesService,
    DefinitionOfDoneService,
    SpaceWorkflowsService,
    WorkflowSharingService,
    WorkflowLibraryService,
  ],
})
export class WorkflowsModule {}

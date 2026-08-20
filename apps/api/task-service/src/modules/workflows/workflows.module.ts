import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowLibraryService } from './workflow-library.service';

@Module({
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowLibraryService],
  exports: [WorkflowsService, WorkflowLibraryService],
})
export class WorkflowsModule {}

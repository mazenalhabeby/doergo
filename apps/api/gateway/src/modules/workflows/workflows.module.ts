import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowStepsController } from './workflow-steps.controller';
import { SpaceWorkflowsController } from './space-workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [
  ],
  controllers: [WorkflowsController, WorkflowStepsController, SpaceWorkflowsController],
  providers: [WorkflowsService],
})
export class WorkflowsModule {}

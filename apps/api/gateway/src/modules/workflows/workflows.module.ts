import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
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

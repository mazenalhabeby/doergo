import { Global, Module } from '@nestjs/common';
import { WorkflowConfigCache } from './workflow-config-cache.service';

/** Global so TasksService (read) and WorkflowsService (invalidate) share it. */
@Global()
@Module({
  providers: [WorkflowConfigCache],
  exports: [WorkflowConfigCache],
})
export class WorkflowCacheModule {}

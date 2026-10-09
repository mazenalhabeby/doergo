import { Global, Module } from '@nestjs/common';
import { TaskAccessService } from './task-access.service';

/**
 * Global, like PrismaModule: the task gate is read by tasks, attachments,
 * reports and custom fields, and one instance means one rule.
 */
@Global()
@Module({
  providers: [TaskAccessService],
  exports: [TaskAccessService],
})
export class TaskAccessModule {}

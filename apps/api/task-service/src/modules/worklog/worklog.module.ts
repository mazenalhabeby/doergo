import { Module } from '@nestjs/common';
import { WorklogController } from './worklog.controller';
import { WorklogService } from './worklog.service';
import { WorklogAttachmentsService } from './worklog-attachments.service';

// PrismaModule + ConfigModule are global in task-service, so no imports needed.
@Module({
  controllers: [WorklogController],
  providers: [WorklogService, WorklogAttachmentsService],
})
export class WorklogModule {}

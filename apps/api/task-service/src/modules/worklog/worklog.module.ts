import { Module } from '@nestjs/common';
import { WorklogController } from './worklog.controller';
import { WorklogService } from './worklog.service';
import { WorklogAttachmentsService } from './worklog-attachments.service';
import { WorklogAccess } from './worklog-access.service';

// PrismaModule + ConfigModule are global in task-service, so no imports needed.
@Module({
  controllers: [WorklogController],
  providers: [WorklogService, WorklogAttachmentsService, WorklogAccess],
})
export class WorklogModule {}

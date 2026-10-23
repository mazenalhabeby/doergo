import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { ShiftIssuesService } from './shift-issues.service';
import { ShiftIssuesController } from './shift-issues.controller';
import { ShiftIssueActionsService } from './shift-issue-actions.service';
import { ShiftIssueFiles } from './shift-issue-files.service';
import { ShiftIssueNotices } from './shift-issue-notices.service';

@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  controllers: [ShiftIssuesController],
  providers: [ShiftIssuesService, ShiftIssueActionsService, ShiftIssueFiles, ShiftIssueNotices],
  exports: [ShiftIssuesService],
})
export class ShiftIssuesModule {}

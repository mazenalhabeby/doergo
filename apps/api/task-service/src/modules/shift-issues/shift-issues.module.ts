import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { ShiftIssuesService } from './shift-issues.service';
import { ShiftIssuesController } from './shift-issues.controller';
import { ShiftIssueActionsService } from './shift-issue-actions.service';

@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  controllers: [ShiftIssuesController],
  providers: [ShiftIssuesService, ShiftIssueActionsService],
  exports: [ShiftIssuesService],
})
export class ShiftIssuesModule {}

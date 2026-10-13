import { Module } from '@nestjs/common';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { ApprovalRouteService } from './approval-route.service';
import { StandInsService } from './stand-ins.service';
import { ApprovalRulesClient } from './approval-rules.client';

@Module({
  controllers: [ApprovalsController],
  providers: [ApprovalsService, ApprovalRouteService, StandInsService, ApprovalRulesClient],
})
export class ApprovalsModule {}

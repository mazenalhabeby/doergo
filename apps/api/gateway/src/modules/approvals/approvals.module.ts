import { Module } from '@nestjs/common';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { ApprovalRouteService } from './approval-route.service';
import { StandInsService } from './stand-ins.service';

@Module({
  controllers: [ApprovalsController],
  providers: [ApprovalsService, ApprovalRouteService, StandInsService],
})
export class ApprovalsModule {}

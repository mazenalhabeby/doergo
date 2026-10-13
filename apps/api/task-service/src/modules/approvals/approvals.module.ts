import { Module } from '@nestjs/common';
import { ApprovalsController } from './approvals.controller';
import { ApprovalRouteService } from './approval-route.service';
import { StandInsService } from './stand-ins.service';

@Module({
  controllers: [ApprovalsController],
  providers: [ApprovalRouteService, StandInsService],
})
export class ApprovalsModule {}

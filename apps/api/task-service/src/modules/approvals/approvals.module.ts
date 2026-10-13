import { Module } from '@nestjs/common';
import { ApprovalsController } from './approvals.controller';
import { ApprovalRouteService } from './approval-route.service';

@Module({
  controllers: [ApprovalsController],
  providers: [ApprovalRouteService],
})
export class ApprovalsModule {}

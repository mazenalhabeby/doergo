import { Module } from '@nestjs/common';
import { ApprovalsController } from './approvals.controller';
import { StandInsService } from './stand-ins.service';

@Module({
  controllers: [ApprovalsController],
  providers: [StandInsService],
})
export class ApprovalsModule {}

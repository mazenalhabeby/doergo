import { Module } from '@nestjs/common';
import { ShiftIssuesController } from './shift-issues.controller';
import { ShiftIssuesService } from './shift-issues.service';

// The SERVICE_NAMES.TASK ClientProxy is provided globally (MicroservicesModule).
@Module({
  controllers: [ShiftIssuesController],
  providers: [ShiftIssuesService],
})
export class ShiftIssuesModule {}

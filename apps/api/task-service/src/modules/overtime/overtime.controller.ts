import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { OvertimeService } from './overtime.service';
import { OvertimeRecordService } from './overtime-record.service';
import { OvertimeSummaryService } from './overtime-summary.service';

@Controller()
export class OvertimeController {
  constructor(
    private readonly overtimeService: OvertimeService,
    private readonly record: OvertimeRecordService,
    private readonly overtimeTotals: OvertimeSummaryService,
  ) {}

  @MessagePattern({ cmd: 'get_active_overtime' })
  async getActive(@Payload() data: { userId: string }) {
    return this.overtimeService.getActive(data);
  }

  @MessagePattern({ cmd: 'get_pending_overtime_approvals' })
  async getPendingApprovals(@Payload() data: { organizationId: string; scopeSpaceIds?: string[] | null }) {
    return this.overtimeService.getPendingApprovals(data);
  }

  @MessagePattern({ cmd: 'get_overtime_history' })
  async getHistory(@Payload() data: any) {
    return this.record.history(data);
  }

  @MessagePattern({ cmd: 'get_overtime_summary' })
  async getSummary(@Payload() data: any) {
    return this.overtimeTotals.summary(data);
  }

  @MessagePattern({ cmd: 'get_overtime_round' })
  async getRound(@Payload() data: any) {
    return this.record.round(data);
  }
}

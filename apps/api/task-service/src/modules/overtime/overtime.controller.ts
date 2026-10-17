import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { OvertimeService } from './overtime.service';
import { OvertimeRecordService } from './overtime-record.service';
import { OvertimeSummaryService } from './overtime-summary.service';
import {
  pattern,
  type RpcRequest,
  getActiveOvertime,
  getPendingOvertimeApprovals,
  getOvertimeHistory,
  getOvertimeSummary,
  getOvertimeRound,
} from '@hbcfield/shared/microservices';

@Controller()
export class OvertimeController {
  constructor(
    private readonly overtimeService: OvertimeService,
    private readonly record: OvertimeRecordService,
    private readonly overtimeTotals: OvertimeSummaryService,
  ) {}

  @MessagePattern(pattern(getActiveOvertime))
  async getActive(@Payload() data: RpcRequest<typeof getActiveOvertime>) {
    return this.overtimeService.getActive(data);
  }

  @MessagePattern(pattern(getPendingOvertimeApprovals))
  async getPendingApprovals(@Payload() data: RpcRequest<typeof getPendingOvertimeApprovals>) {
    return this.overtimeService.getPendingApprovals(data);
  }

  @MessagePattern(pattern(getOvertimeHistory))
  async getHistory(@Payload() data: RpcRequest<typeof getOvertimeHistory>) {
    return this.record.history(data);
  }

  @MessagePattern(pattern(getOvertimeSummary))
  async getSummary(@Payload() data: RpcRequest<typeof getOvertimeSummary>) {
    return this.overtimeTotals.summary(data);
  }

  @MessagePattern(pattern(getOvertimeRound))
  async getRound(@Payload() data: RpcRequest<typeof getOvertimeRound>) {
    return this.record.round(data);
  }
}

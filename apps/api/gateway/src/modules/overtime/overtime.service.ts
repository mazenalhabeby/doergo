import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  type RpcRequest,
  getActiveOvertime,
  getPendingOvertimeApprovals,
  getOvertimeHistory,
  getOvertimeSummary,
  getOvertimeRound,
} from '@hbcfield/shared/microservices';

@Injectable()
export class OvertimeGatewayService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, OvertimeGatewayService.name);
  }

  async getActive(data: RpcRequest<typeof getActiveOvertime>) {
    return this.send(pattern(getActiveOvertime), data);
  }

  async getPendingApprovals(data: RpcRequest<typeof getPendingOvertimeApprovals>) {
    return this.send(pattern(getPendingOvertimeApprovals), data);
  }

  async getHistory(data: RpcRequest<typeof getOvertimeHistory>) {
    return this.send(pattern(getOvertimeHistory), data);
  }

  async getSummary(data: RpcRequest<typeof getOvertimeSummary>) {
    return this.send(pattern(getOvertimeSummary), data);
  }

  async getRound(data: RpcRequest<typeof getOvertimeRound>) {
    return this.send(pattern(getOvertimeRound), data);
  }
}

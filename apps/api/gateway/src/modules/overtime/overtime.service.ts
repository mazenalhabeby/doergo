import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

@Injectable()
export class OvertimeGatewayService extends BaseGatewayService {
  constructor(
    @Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy,
  ) {
    super(taskClient, OvertimeGatewayService.name);
  }

  async getActive(data: { userId: string }) {
    return this.send({ cmd: 'get_active_overtime' }, data);
  }

  async getPendingApprovals(data: { organizationId: string }) {
    return this.send({ cmd: 'get_pending_overtime_approvals' }, data);
  }

  async getHistory(data: any) {
    return this.send({ cmd: 'get_overtime_history' }, data);
  }
}

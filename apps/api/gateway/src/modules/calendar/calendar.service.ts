import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { BaseGatewayService, SERVICE_NAMES } from '@hbcfield/shared';
import { pattern, type RpcContract } from '@hbcfield/shared/microservices';

/** The calendar in task-service. Reads retry on a transient failure; writes are sent once. */
@Injectable()
export class CalendarGatewayService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, CalendarGatewayService.name);
  }

  read<Req, Res>(contract: RpcContract<Req, Res>, data: Req) {
    return this.send<Res>(pattern(contract), data);
  }

  write<Req, Res>(contract: RpcContract<Req, Res>, data: Req) {
    return this.sendOnce<Res>(pattern(contract), data);
  }
}

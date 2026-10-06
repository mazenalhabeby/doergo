import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { BaseGatewayService, SERVICE_NAMES } from '@hbcfield/shared';

/** The calendar in task-service. Reads retry on a transient failure; writes are sent once. */
@Injectable()
export class CalendarGatewayService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, CalendarGatewayService.name);
  }

  read(cmd: string, data: Record<string, unknown>) {
    return this.send({ cmd }, data);
  }

  write(cmd: string, data: Record<string, unknown>) {
    return this.sendOnce({ cmd }, data);
  }
}

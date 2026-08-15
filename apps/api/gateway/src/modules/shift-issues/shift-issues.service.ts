import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

/** Gateway → task-service proxy for Shift Issues (synchronous request/reply). */
@Injectable()
export class ShiftIssuesService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, ShiftIssuesService.name);
  }

  create(data: any) { return this.send({ cmd: 'shift_issue_create' }, data); }
  list(data: any) { return this.send({ cmd: 'shift_issue_list' }, data); }
  get(data: any) { return this.send({ cmd: 'shift_issue_get' }, data); }
  message(data: any) { return this.send({ cmd: 'shift_issue_message' }, data); }
  acknowledge(data: any) { return this.send({ cmd: 'shift_issue_acknowledge' }, data); }
  assign(data: any) { return this.send({ cmd: 'shift_issue_assign' }, data); }
  setStatus(data: any) { return this.send({ cmd: 'shift_issue_status' }, data); }
  presign(data: any) { return this.send({ cmd: 'shift_issue_presign' }, data); }
}

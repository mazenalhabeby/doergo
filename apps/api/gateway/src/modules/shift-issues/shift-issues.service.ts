import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  type RpcRequest,
  shiftIssueCreate,
  shiftIssueList,
  shiftIssueGet,
  shiftIssueMessage,
  shiftIssueAcknowledge,
  shiftIssueAssign,
  shiftIssueStatus,
  shiftIssuePresign,
} from '@hbcfield/shared/microservices';

/** Gateway → task-service proxy for Shift Issues (synchronous request/reply). */
@Injectable()
export class ShiftIssuesService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, ShiftIssuesService.name);
  }

  // Writes are sent once: send() retries on a slow answer, and a retried report lands twice.
  create(data: RpcRequest<typeof shiftIssueCreate>) {
    return this.sendOnce(pattern(shiftIssueCreate), data);
  }
  list(data: RpcRequest<typeof shiftIssueList>) {
    return this.send(pattern(shiftIssueList), data);
  }
  get(data: RpcRequest<typeof shiftIssueGet>) {
    return this.send(pattern(shiftIssueGet), data);
  }
  message(data: RpcRequest<typeof shiftIssueMessage>) {
    return this.sendOnce(pattern(shiftIssueMessage), data);
  }
  acknowledge(data: RpcRequest<typeof shiftIssueAcknowledge>) {
    return this.sendOnce(pattern(shiftIssueAcknowledge), data);
  }
  assign(data: RpcRequest<typeof shiftIssueAssign>) {
    return this.sendOnce(pattern(shiftIssueAssign), data);
  }
  setStatus(data: RpcRequest<typeof shiftIssueStatus>) {
    return this.sendOnce(pattern(shiftIssueStatus), data);
  }
  presign(data: RpcRequest<typeof shiftIssuePresign>) {
    return this.send(pattern(shiftIssuePresign), data);
  }
}

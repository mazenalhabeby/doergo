import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  supportAddMessage,
  supportCreate,
  supportList,
  supportMarkRead,
  supportThread,
  type RpcRequest,
} from '@hbcfield/shared/microservices';

/**
 * Gateway → task-service proxy for support. Support ops are synchronous
 * request/reply (no BullMQ on the write path — the only delayed work is the
 * SLA-breach job, scheduled inside task-service).
 *
 * The member side only. The agent side (inbox, assign, status) is the
 * operator console's — platform-admin/platform-support.service.ts.
 */
@Injectable()
export class SupportService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, SupportService.name);
  }

  createTicket(data: RpcRequest<typeof supportCreate>) {
    return this.sendOnce(pattern(supportCreate), data);
  }
  addMessage(data: RpcRequest<typeof supportAddMessage>) {
    return this.sendOnce(pattern(supportAddMessage), data);
  }
  markRead(data: RpcRequest<typeof supportMarkRead>) {
    return this.send(pattern(supportMarkRead), data);
  }
  list(data: RpcRequest<typeof supportList>) {
    return this.send(pattern(supportList), data);
  }
  thread(data: RpcRequest<typeof supportThread>) {
    return this.send(pattern(supportThread), data);
  }
}

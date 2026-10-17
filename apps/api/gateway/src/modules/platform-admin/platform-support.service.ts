import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService, type SupportAgentScope } from '@hbcfield/shared';
import {
  pattern,
  supportAddMessage,
  supportAssign,
  supportInbox,
  supportMarkRead,
  supportSetStatus,
  supportThread,
  type RpcRequest,
} from '@hbcfield/shared/microservices';

/** Gateway → task-service proxy for platform-staff support (agent side). */
@Injectable()
export class PlatformSupportService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, PlatformSupportService.name);
  }
  inbox(data: RpcRequest<typeof supportInbox>) {
    return this.send(pattern(supportInbox), data);
  }
  thread(ticketId: string, scope: SupportAgentScope) {
    return this.send(pattern(supportThread), { ticketId, asAgent: true, scope } satisfies RpcRequest<
      typeof supportThread
    >);
  }
  reply(data: RpcRequest<typeof supportAddMessage>) {
    return this.send(pattern(supportAddMessage), data);
  }
  assign(data: RpcRequest<typeof supportAssign>) {
    return this.send(pattern(supportAssign), data);
  }
  setStatus(data: RpcRequest<typeof supportSetStatus>) {
    return this.send(pattern(supportSetStatus), data);
  }
  markRead(ticketId: string, scope: SupportAgentScope) {
    return this.send(pattern(supportMarkRead), { ticketId, reader: 'AGENT', scope } satisfies RpcRequest<
      typeof supportMarkRead
    >);
  }
}

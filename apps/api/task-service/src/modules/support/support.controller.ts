import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  pattern,
  supportAddMessage,
  supportAssign,
  supportCreate,
  supportInbox,
  supportList,
  supportMarkRead,
  supportSetStatus,
  supportThread,
  supportTicketsUnassignTeam,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
import { SupportService } from './support.service';
import { SupportInboxService } from './support-inbox.service';

/**
 * Support ops are synchronous request/reply (ClientProxy.send from the gateway) —
 * the only asynchronous piece is the delayed SLA-breach job (see the processor).
 */
@Controller()
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly supportInbox: SupportInboxService,
  ) {}

  @MessagePattern(pattern(supportTicketsUnassignTeam))
  unassignTeam(@Payload() data: RpcRequest<typeof supportTicketsUnassignTeam>) {
    return this.supportInbox.unassignTeam(data.teamId);
  }

  @MessagePattern(pattern(supportCreate))
  create(@Payload() data: RpcRequest<typeof supportCreate>) {
    return this.support.createTicket(data);
  }

  @MessagePattern(pattern(supportAddMessage))
  addMessage(@Payload() data: RpcRequest<typeof supportAddMessage>) {
    return this.support.addMessage(data);
  }

  @MessagePattern(pattern(supportAssign))
  assign(@Payload() data: RpcRequest<typeof supportAssign>) {
    return this.support.assign(data);
  }

  @MessagePattern(pattern(supportSetStatus))
  setStatus(@Payload() data: RpcRequest<typeof supportSetStatus>) {
    return this.support.setStatus(data);
  }

  @MessagePattern(pattern(supportMarkRead))
  markRead(@Payload() data: RpcRequest<typeof supportMarkRead>) {
    return this.support.markRead(data);
  }

  @MessagePattern(pattern(supportList))
  list(@Payload() data: RpcRequest<typeof supportList>) {
    return this.supportInbox.listForCustomer(data);
  }

  @MessagePattern(pattern(supportThread))
  thread(@Payload() data: RpcRequest<typeof supportThread>) {
    return this.supportInbox.getThread(data);
  }

  @MessagePattern(pattern(supportInbox))
  inbox(@Payload() data: RpcRequest<typeof supportInbox>) {
    return this.supportInbox.agentInbox(data);
  }
}

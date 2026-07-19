import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SupportService } from './support.service';

/**
 * Support ops are synchronous request/reply (ClientProxy.send from the gateway) —
 * the only asynchronous piece is the delayed SLA-breach job (see the processor).
 */
@Controller()
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @MessagePattern({ cmd: 'support.create' })
  create(@Payload() data: any) {
    return this.support.createTicket(data);
  }

  @MessagePattern({ cmd: 'support.addMessage' })
  addMessage(@Payload() data: any) {
    return this.support.addMessage(data);
  }

  @MessagePattern({ cmd: 'support.assign' })
  assign(@Payload() data: any) {
    return this.support.assign(data);
  }

  @MessagePattern({ cmd: 'support.setStatus' })
  setStatus(@Payload() data: any) {
    return this.support.setStatus(data);
  }

  @MessagePattern({ cmd: 'support.markRead' })
  markRead(@Payload() data: any) {
    return this.support.markRead(data);
  }

  @MessagePattern({ cmd: 'support.list' })
  list(@Payload() data: any) {
    return this.support.listForCustomer(data);
  }

  @MessagePattern({ cmd: 'support.thread' })
  thread(@Payload() data: any) {
    return this.support.getThread(data);
  }

  @MessagePattern({ cmd: 'support.inbox' })
  inbox(@Payload() data: any) {
    return this.support.agentInbox(data);
  }
}

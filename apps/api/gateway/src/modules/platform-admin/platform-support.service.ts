import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

/** Gateway → task-service proxy for platform-staff support (agent side). */
@Injectable()
export class PlatformSupportService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, PlatformSupportService.name);
  }
  inbox(data: any) { return this.send({ cmd: 'support.inbox' }, data); }
  thread(ticketId: string) { return this.send({ cmd: 'support.thread' }, { ticketId, asAgent: true }); }
  reply(data: any) { return this.send({ cmd: 'support.addMessage' }, data); }
  assign(data: any) { return this.send({ cmd: 'support.assign' }, data); }
  setStatus(data: any) { return this.send({ cmd: 'support.setStatus' }, data); }
  markRead(ticketId: string) { return this.send({ cmd: 'support.markRead' }, { ticketId, asAgent: true }); }
}

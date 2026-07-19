import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

/**
 * Gateway → task-service proxy for support. Support ops are synchronous
 * request/reply (no BullMQ on the write path — the only delayed work is the
 * SLA-breach job, scheduled inside task-service).
 */
@Injectable()
export class SupportService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, SupportService.name);
  }

  createTicket(data: any) {
    return this.send({ cmd: 'support.create' }, data);
  }
  addMessage(data: any) {
    return this.send({ cmd: 'support.addMessage' }, data);
  }
  assign(data: any) {
    return this.send({ cmd: 'support.assign' }, data);
  }
  setStatus(data: any) {
    return this.send({ cmd: 'support.setStatus' }, data);
  }
  markRead(data: any) {
    return this.send({ cmd: 'support.markRead' }, data);
  }
  list(data: any) {
    return this.send({ cmd: 'support.list' }, data);
  }
  thread(data: any) {
    return this.send({ cmd: 'support.thread' }, data);
  }
  inbox(data: any) {
    return this.send({ cmd: 'support.inbox' }, data);
  }
}

import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';

/** Gateway → task-service proxy for member-to-member chat. */
@Injectable()
export class ChatService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, ChatService.name);
  }

  contacts(data: any) {
    return this.send({ cmd: 'chat.contacts' }, data);
  }
  openDirect(data: any) {
    return this.send({ cmd: 'chat.openDirect' }, data);
  }
  listConversations(data: any) {
    return this.send({ cmd: 'chat.listConversations' }, data);
  }
  history(data: any) {
    return this.send({ cmd: 'chat.history' }, data);
  }
  send_(data: any) {
    return this.send({ cmd: 'chat.send' }, data);
  }
  markRead(data: any) {
    return this.send({ cmd: 'chat.markRead' }, data);
  }
}

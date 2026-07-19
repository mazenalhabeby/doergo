import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ChatService } from './chat.service';

@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @MessagePattern({ cmd: 'chat.contacts' })
  contacts(@Payload() data: any) {
    return this.chat.listContacts(data);
  }

  @MessagePattern({ cmd: 'chat.openDirect' })
  openDirect(@Payload() data: any) {
    return this.chat.openDirect(data);
  }

  @MessagePattern({ cmd: 'chat.listConversations' })
  list(@Payload() data: any) {
    return this.chat.listConversations(data);
  }

  @MessagePattern({ cmd: 'chat.history' })
  history(@Payload() data: any) {
    return this.chat.history(data);
  }

  @MessagePattern({ cmd: 'chat.send' })
  send(@Payload() data: any) {
    return this.chat.sendMessage(data);
  }

  @MessagePattern({ cmd: 'chat.markRead' })
  markRead(@Payload() data: any) {
    return this.chat.markRead(data);
  }
}

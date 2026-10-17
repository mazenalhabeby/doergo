import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ChatService } from './chat.service';
import { ChatEditService } from './chat-edit.service';
import { ChatReachService } from './chat-reach.service';
import { ChatGroupsService } from './chat-groups.service';
import { ChatTasksService } from './chat-tasks.service';
import { ChatSearchService } from './chat-search.service';
import { ChatMessagesService } from './chat-messages.service';

@Controller()
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly messages: ChatMessagesService,
    private readonly edits: ChatEditService,
    private readonly reach: ChatReachService,
    private readonly groups: ChatGroupsService,
    private readonly tasks: ChatTasksService,
    private readonly searcher: ChatSearchService,
  ) {}

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
    return this.messages.history(data);
  }

  @MessagePattern({ cmd: 'chat.send' })
  send(@Payload() data: any) {
    return this.messages.sendMessage(data);
  }

  @MessagePattern({ cmd: 'chat.badge' })
  badge(@Payload() data: any) {
    return this.chat.badge(data);
  }

  @MessagePattern({ cmd: 'chat.markRead' })
  markRead(@Payload() data: any) {
    return this.messages.markRead(data);
  }

  @MessagePattern({ cmd: 'chat.mute' })
  mute(@Payload() data: any) {
    return this.messages.mute(data);
  }

  @MessagePattern({ cmd: 'chat.edit' })
  edit(@Payload() data: any) {
    return this.edits.edit(data);
  }

  @MessagePattern({ cmd: 'chat.remove' })
  remove(@Payload() data: any) {
    return this.edits.remove(data);
  }

  @MessagePattern({ cmd: 'chat.presignAttachment' })
  presignAttachment(@Payload() data: any) {
    return this.messages.presignAttachment(data);
  }

  @MessagePattern({ cmd: 'chat.capabilities' })
  async capabilities(@Payload() data: { userId: string }) {
    return { success: true, data: { mayCreateGroup: await this.reach.mayCreateGroup(data.userId) } };
  }

  @MessagePattern({ cmd: 'chat.createGroup' })
  createGroup(@Payload() data: any) {
    return this.groups.create(data);
  }

  @MessagePattern({ cmd: 'chat.renameGroup' })
  renameGroup(@Payload() data: any) {
    return this.groups.rename(data);
  }

  @MessagePattern({ cmd: 'chat.addMembers' })
  addMembers(@Payload() data: any) {
    return this.groups.addMembers(data);
  }

  @MessagePattern({ cmd: 'chat.removeMember' })
  removeMember(@Payload() data: any) {
    return this.groups.removeMember(data);
  }

  @MessagePattern({ cmd: 'chat.leaveGroup' })
  leaveGroup(@Payload() data: any) {
    return this.groups.leave(data);
  }

  @MessagePattern({ cmd: 'chat.openTask' })
  openTask(@Payload() data: any) {
    return this.tasks.open(data);
  }

  @MessagePattern({ cmd: 'chat.search' })
  search(@Payload() data: any) {
    return this.searcher.search(data);
  }

  @MessagePattern({ cmd: 'chat.reachableIds' })
  reachableIds(@Payload() data: any) {
    return this.reach.reachableIds(data);
  }
}

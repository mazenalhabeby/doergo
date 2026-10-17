import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  pattern,
  chatAddMembers,
  chatBadge,
  chatCapabilities,
  chatContacts,
  chatCreateGroup,
  chatEdit,
  chatHistory,
  chatLeaveGroup,
  chatListConversations,
  chatMarkRead,
  chatMute,
  chatOpenDirect,
  chatOpenTask,
  chatPresignAttachment,
  chatReachableIds,
  chatRemove,
  chatRemoveMember,
  chatRenameGroup,
  chatSearch,
  chatSend,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
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

  @MessagePattern(pattern(chatContacts))
  contacts(@Payload() data: RpcRequest<typeof chatContacts>) {
    return this.chat.listContacts(data);
  }

  @MessagePattern(pattern(chatOpenDirect))
  openDirect(@Payload() data: RpcRequest<typeof chatOpenDirect>) {
    return this.chat.openDirect(data);
  }

  @MessagePattern(pattern(chatListConversations))
  list(@Payload() data: RpcRequest<typeof chatListConversations>) {
    return this.chat.listConversations(data);
  }

  @MessagePattern(pattern(chatHistory))
  history(@Payload() data: RpcRequest<typeof chatHistory>) {
    return this.messages.history(data);
  }

  @MessagePattern(pattern(chatSend))
  send(@Payload() data: RpcRequest<typeof chatSend>) {
    return this.messages.sendMessage(data);
  }

  @MessagePattern(pattern(chatBadge))
  badge(@Payload() data: RpcRequest<typeof chatBadge>) {
    return this.chat.badge(data);
  }

  @MessagePattern(pattern(chatMarkRead))
  markRead(@Payload() data: RpcRequest<typeof chatMarkRead>) {
    return this.messages.markRead(data);
  }

  @MessagePattern(pattern(chatMute))
  mute(@Payload() data: RpcRequest<typeof chatMute>) {
    return this.messages.mute(data);
  }

  @MessagePattern(pattern(chatEdit))
  edit(@Payload() data: RpcRequest<typeof chatEdit>) {
    return this.edits.edit(data);
  }

  @MessagePattern(pattern(chatRemove))
  remove(@Payload() data: RpcRequest<typeof chatRemove>) {
    return this.edits.remove(data);
  }

  @MessagePattern(pattern(chatPresignAttachment))
  presignAttachment(@Payload() data: RpcRequest<typeof chatPresignAttachment>) {
    return this.messages.presignAttachment(data);
  }

  @MessagePattern(pattern(chatCapabilities))
  async capabilities(@Payload() data: RpcRequest<typeof chatCapabilities>) {
    return { success: true, data: { mayCreateGroup: await this.reach.mayCreateGroup(data.userId) } };
  }

  @MessagePattern(pattern(chatCreateGroup))
  createGroup(@Payload() data: RpcRequest<typeof chatCreateGroup>) {
    return this.groups.create(data);
  }

  @MessagePattern(pattern(chatRenameGroup))
  renameGroup(@Payload() data: RpcRequest<typeof chatRenameGroup>) {
    return this.groups.rename(data);
  }

  @MessagePattern(pattern(chatAddMembers))
  addMembers(@Payload() data: RpcRequest<typeof chatAddMembers>) {
    return this.groups.addMembers(data);
  }

  @MessagePattern(pattern(chatRemoveMember))
  removeMember(@Payload() data: RpcRequest<typeof chatRemoveMember>) {
    return this.groups.removeMember(data);
  }

  @MessagePattern(pattern(chatLeaveGroup))
  leaveGroup(@Payload() data: RpcRequest<typeof chatLeaveGroup>) {
    return this.groups.leave(data);
  }

  @MessagePattern(pattern(chatOpenTask))
  openTask(@Payload() data: RpcRequest<typeof chatOpenTask>) {
    return this.tasks.open(data);
  }

  @MessagePattern(pattern(chatSearch))
  search(@Payload() data: RpcRequest<typeof chatSearch>) {
    return this.searcher.search(data);
  }

  @MessagePattern(pattern(chatReachableIds))
  reachableIds(@Payload() data: RpcRequest<typeof chatReachableIds>) {
    return this.reach.reachableIds(data);
  }
}

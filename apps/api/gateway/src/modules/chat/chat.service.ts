import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
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

/** Gateway → task-service proxy for member-to-member chat. */
@Injectable()
export class ChatService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, ChatService.name);
  }

  contacts(data: RpcRequest<typeof chatContacts>) {
    return this.send(pattern(chatContacts), data);
  }
  openDirect(data: RpcRequest<typeof chatOpenDirect>) {
    return this.send(pattern(chatOpenDirect), data);
  }
  listConversations(data: RpcRequest<typeof chatListConversations>) {
    return this.send(pattern(chatListConversations), data);
  }
  history(data: RpcRequest<typeof chatHistory>) {
    return this.send(pattern(chatHistory), data);
  }
  send_(data: RpcRequest<typeof chatSend>) {
    // Once: a retried send is a message delivered twice.
    return this.sendOnce(pattern(chatSend), data);
  }
  /** Ids the caller may message (chat's own rule) — for Message buttons on people lists. */
  reachableIds(data: { userId: string; organizationId: string }) {
    return this.send(pattern(chatReachableIds), data satisfies RpcRequest<typeof chatReachableIds>);
  }
  badge(data: { userId: string }) {
    return this.send(pattern(chatBadge), data satisfies RpcRequest<typeof chatBadge>);
  }
  presignAttachment(data: RpcRequest<typeof chatPresignAttachment>) {
    return this.send(pattern(chatPresignAttachment), data);
  }
  edit(data: RpcRequest<typeof chatEdit>) {
    return this.send(pattern(chatEdit), data);
  }
  remove(data: RpcRequest<typeof chatRemove>) {
    return this.send(pattern(chatRemove), data);
  }
  mute(data: { conversationId: string; userId: string; until: string | null }) {
    return this.send(pattern(chatMute), data satisfies RpcRequest<typeof chatMute>);
  }
  capabilities(data: { userId: string }) {
    return this.send(pattern(chatCapabilities), data satisfies RpcRequest<typeof chatCapabilities>);
  }
  createGroup(data: { userId: string; organizationId: string; title: string; memberIds: string[] }) {
    return this.sendOnce(pattern(chatCreateGroup), data satisfies RpcRequest<typeof chatCreateGroup>);
  }
  renameGroup(data: { userId: string; organizationId: string; conversationId: string; title: string }) {
    return this.send(pattern(chatRenameGroup), data satisfies RpcRequest<typeof chatRenameGroup>);
  }
  addMembers(data: { userId: string; organizationId: string; conversationId: string; userIds: string[] }) {
    return this.send(pattern(chatAddMembers), data satisfies RpcRequest<typeof chatAddMembers>);
  }
  removeMember(data: { userId: string; organizationId: string; conversationId: string; targetId: string }) {
    return this.send(pattern(chatRemoveMember), data satisfies RpcRequest<typeof chatRemoveMember>);
  }
  leaveGroup(data: { userId: string; organizationId: string; conversationId: string }) {
    return this.send(pattern(chatLeaveGroup), data satisfies RpcRequest<typeof chatLeaveGroup>);
  }
  openTask(data: RpcRequest<typeof chatOpenTask>) {
    return this.send(pattern(chatOpenTask), data);
  }
  search(data: { userId: string; organizationId: string; q: string; before?: string }) {
    return this.send(pattern(chatSearch), data satisfies RpcRequest<typeof chatSearch>);
  }
  markRead(data: RpcRequest<typeof chatMarkRead>) {
    return this.send(pattern(chatMarkRead), data);
  }
}

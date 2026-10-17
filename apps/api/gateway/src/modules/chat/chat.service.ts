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
    // Once: a retried send is a message delivered twice.
    return this.sendOnce({ cmd: 'chat.send' }, data);
  }
  /** Ids the caller may message (chat's own rule) — for Message buttons on people lists. */
  reachableIds(data: { userId: string; organizationId: string }) {
    return this.send({ cmd: 'chat.reachableIds' }, data);
  }
  badge(data: { userId: string }) {
    return this.send({ cmd: 'chat.badge' }, data);
  }
  presignAttachment(data: {
    conversationId: string;
    userId: string;
    fileName: string;
    mimeType: string;
    facts?: unknown;
  }) {
    return this.send({ cmd: 'chat.presignAttachment' }, data);
  }
  edit(data: { messageId: string; userId: string; body: string; facts?: unknown }) {
    return this.send({ cmd: 'chat.edit' }, data);
  }
  remove(data: { messageId: string; userId: string; facts?: unknown }) {
    return this.send({ cmd: 'chat.remove' }, data);
  }
  mute(data: { conversationId: string; userId: string; until: string | null }) {
    return this.send({ cmd: 'chat.mute' }, data);
  }
  capabilities(data: { userId: string }) {
    return this.send({ cmd: 'chat.capabilities' }, data);
  }
  createGroup(data: { userId: string; organizationId: string; title: string; memberIds: string[] }) {
    return this.sendOnce({ cmd: 'chat.createGroup' }, data);
  }
  renameGroup(data: { userId: string; organizationId: string; conversationId: string; title: string }) {
    return this.send({ cmd: 'chat.renameGroup' }, data);
  }
  addMembers(data: { userId: string; organizationId: string; conversationId: string; userIds: string[] }) {
    return this.send({ cmd: 'chat.addMembers' }, data);
  }
  removeMember(data: { userId: string; organizationId: string; conversationId: string; targetId: string }) {
    return this.send({ cmd: 'chat.removeMember' }, data);
  }
  leaveGroup(data: { userId: string; organizationId: string; conversationId: string }) {
    return this.send({ cmd: 'chat.leaveGroup' }, data);
  }
  openTask(data: Record<string, unknown>) {
    return this.send({ cmd: 'chat.openTask' }, data);
  }
  search(data: { userId: string; organizationId: string; q: string; before?: string }) {
    return this.send({ cmd: 'chat.search' }, data);
  }
  markRead(data: any) {
    return this.send({ cmd: 'chat.markRead' }, data);
  }
}

import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { conversationMemberIds, PrismaService, SocketEvents } from '@hbcfield/shared';
import { ChatMembersCache, typingRecipients } from './chat-members';
import { SocketRegistry } from './socket-registry';

/** Member-to-member chat: the events a conversation sends, and the typing / viewing relays. */
@Injectable()
export class ChatEvents {
  /** Conversation members for the typing relay, cached a minute per thread. */
  private readonly members: ChatMembersCache;

  constructor(
    private readonly registry: SocketRegistry,
    prisma: PrismaService,
  ) {
    this.members = new ChatMembersCache((conversationId) => conversationMemberIds(prisma, conversationId));
  }

  // =========================================================================
  // CHAT EVENTS (member-to-member)
  // =========================================================================

  /** Deliver a new chat message to every member's user room (incl. the sender's
   *  other devices) — they're already joined to user:{id} after authenticate. */
  emitChatMessage(payload: {
    conversationId: string;
    message: { senderId?: string } & Record<string, unknown>;
    recipients: string[];
    /** Each member's unread count for the thread and their unread total (servers since 2026-10-15). */
    unread?: Record<string, number>;
    badge?: Record<string, number>;
  }) {
    this.registry.messagesSent += 1;
    const targets = new Set<string>([...(payload.recipients || [])]);
    if (payload.message?.senderId) targets.add(payload.message.senderId);
    // Every person gets THEIR numbers, so no screen reloads a list to draw a badge.
    for (const uid of targets) {
      this.registry.server.to(`user:${uid}`).emit(SocketEvents.CHAT_MESSAGE, {
        conversationId: payload.conversationId,
        message: payload.message,
        unread: payload.unread?.[uid],
        badge: payload.badge?.[uid],
      });
    }
  }

  /** A member read a thread: everyone in it may draw "Read" under what they wrote. */
  emitChatRead(memberIds: string[], evt: { conversationId: string; userId: string; at: string }) {
    this.registry.messagesSent += 1;
    for (const uid of new Set(memberIds)) this.registry.server.to(`user:${uid}`).emit(SocketEvents.CHAT_READ, evt);
  }

  /** A message was edited or removed: every member's screen replaces it. */
  emitChatMessageChanged(memberIds: string[], evt: { conversationId: string; message: unknown }) {
    this.registry.messagesSent += 1;
    for (const uid of new Set(memberIds))
      this.registry.server.to(`user:${uid}`).emit(SocketEvents.CHAT_MESSAGE_CHANGED, evt);
  }

  /**
   * Who is in a conversation changed (a group was changed, a job's crew moved):
   * forget the cached member list, and every affected person's list re-reads —
   * `removed` tells a person who was taken out to close the thread.
   */
  emitChatMembersChanged(conversationId: string, userIds: string[], removedIds: string[]) {
    this.members.forget(conversationId);
    this.registry.messagesSent += 1;
    const removed = new Set(removedIds);
    for (const uid of new Set(userIds)) {
      this.registry.server
        .to(`user:${uid}`)
        .emit(SocketEvents.CHAT_CONVERSATION_UPDATED, { conversationId, removed: removed.has(uid) });
    }
  }

  /** One person's unread total changed (they read a thread on another screen). */
  emitChatBadge(userId: string, total: number) {
    this.registry.messagesSent += 1;
    this.registry.server.to(`user:${userId}`).emit(SocketEvents.CHAT_BADGE, { total });
  }

  /**
   * "I am looking at this conversation" (null: at none). A person reading a
   * thread gets no push for it — the message is already on their screen. Only
   * a conversation they are a member of is recorded.
   */
  async viewConversation(client: Socket, payload: { conversationId?: string | null }) {
    const info = this.registry.clients.get(client.id);
    if (!info || info.role === 'CUSTOMER') return;
    const id = typeof payload?.conversationId === 'string' ? payload.conversationId : null;
    if (!id) {
      info.viewingConversationId = null;
      return;
    }
    const members = await this.members.members(id).catch(() => [] as string[]);
    info.viewingConversationId = members.includes(info.userId) ? id : null;
  }

  /**
   * Chat typing indicator — relayed to the other conversation members.
   *
   * Two things this must not do, both of which it used to.
   *
   * It must not leave the organization. A cross-org conversation is held open
   * by a shared space so two companies can coordinate work; that is agreement
   * to exchange messages, not a licence to watch someone type in real time.
   * Presence and typing say when a person is at their desk and how they are
   * composing a sentence, which is a level of visibility into another
   * business's staff nobody signed up for.
   *
   * And it must not take the recipient list from the client. `recipientIds`
   * arrives over the wire, so anything a member could name, they could make
   * "…is typing" appear on — including people they share no conversation with.
   * The sender's own organization is read from their authenticated socket, and
   * every recipient is checked against the sockets actually connected. Typing
   * is ephemeral: a recipient who is not connected has nothing to receive, so
   * resolving through live sockets costs nothing and closes both holes at once.
   */
  async relayTyping(client: Socket, payload: { conversationId: string; recipientIds?: string[]; from?: string }) {
    const sender = this.registry.clients.get(client.id);
    // Portal customers are excluded from member chat entirely — reject any
    // chat-typing relay from a customer socket (spoof defense).
    if (!sender || sender.role === 'CUSTOMER') return;
    if (typeof payload?.conversationId !== 'string' || !payload.conversationId) return;

    // Recipients come from the conversation's membership, never from the client
    // (`recipientIds` is ignored). Organizations of everyone connected are read
    // from live sockets, so no recipient costs a database round trip.
    const members = await this.members.members(payload.conversationId).catch(() => [] as string[]);
    const orgByUser = new Map<string, string>();
    for (const info of this.registry.clients.values()) {
      if (info.role !== 'CUSTOMER') orgByUser.set(info.userId, info.organizationId);
    }
    const evt = { conversationId: payload.conversationId, from: sender.userId };
    for (const uid of typingRecipients(members, sender.userId, (id) => orgByUser.get(id), sender.organizationId)) {
      this.registry.server.to(`user:${uid}`).emit(SocketEvents.CHAT_TYPING, evt);
    }
  }
}

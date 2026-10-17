import { SocketEvents } from '@hbcfield/shared';
import { GatewayPresenceBase } from './gateway-presence.base';

/** Support, chat and generic events — moved here unchanged from websocket.gateway.ts. */
export abstract class GatewayChatEmitsBase extends GatewayPresenceBase {
  // =========================================================================
  // SUPPORT EVENTS
  // =========================================================================

  /** A new support message. Internal notes go to agents only; else customer + agents. */
  emitSupportMessage(payload: {
    ticketId: string;
    message: unknown;
    ticket: unknown;
    isInternalNote?: boolean;
    customerId: string;
  }) {
    this.messagesSent += 1;
    const evt = { ticketId: payload.ticketId, message: payload.message, ticket: payload.ticket };
    this.server.to('support-agents').emit(SocketEvents.SUPPORT_MESSAGE, evt);
    if (!payload.isInternalNote) {
      this.server.to(`user:${payload.customerId}`).emit(SocketEvents.SUPPORT_MESSAGE, evt);
    }
  }

  /** Ticket status/assignment/SLA changed → refresh the customer + agent views. */
  emitSupportTicketUpdated(ticket: { createdById?: string | null } & Record<string, unknown>) {
    this.messagesSent += 1;
    const evt = { ticket };
    this.server.to('support-agents').emit(SocketEvents.SUPPORT_TICKET_UPDATED, evt);
    if (ticket?.createdById) {
      this.server.to(`user:${ticket.createdById}`).emit(SocketEvents.SUPPORT_TICKET_UPDATED, evt);
    }
  }

  /** SLA breached → agents only (escalation surfaces in the inbox). */
  emitSupportSlaBreached(ticket: Record<string, unknown>) {
    this.messagesSent += 1;
    this.logger.warn(`[EMIT] support SLA breached: ticket ${ticket?.id}`);
    this.server.to('support-agents').emit(SocketEvents.SUPPORT_TICKET_UPDATED, { ticket, slaBreached: true });
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
    this.messagesSent += 1;
    const targets = new Set<string>([...(payload.recipients || [])]);
    if (payload.message?.senderId) targets.add(payload.message.senderId);
    // Every person gets THEIR numbers, so no screen reloads a list to draw a badge.
    for (const uid of targets) {
      this.server.to(`user:${uid}`).emit(SocketEvents.CHAT_MESSAGE, {
        conversationId: payload.conversationId,
        message: payload.message,
        unread: payload.unread?.[uid],
        badge: payload.badge?.[uid],
      });
    }
  }

  /** A member read a thread: everyone in it may draw "Read" under what they wrote. */
  emitChatRead(memberIds: string[], evt: { conversationId: string; userId: string; at: string }) {
    this.messagesSent += 1;
    for (const uid of new Set(memberIds)) this.server.to(`user:${uid}`).emit(SocketEvents.CHAT_READ, evt);
  }

  /** A message was edited or removed: every member's screen replaces it. */
  emitChatMessageChanged(memberIds: string[], evt: { conversationId: string; message: unknown }) {
    this.messagesSent += 1;
    for (const uid of new Set(memberIds)) this.server.to(`user:${uid}`).emit(SocketEvents.CHAT_MESSAGE_CHANGED, evt);
  }

  /**
   * Who is in a conversation changed (a group was changed, a job's crew moved):
   * forget the cached member list, and every affected person's list re-reads —
   * `removed` tells a person who was taken out to close the thread.
   */
  emitChatMembersChanged(conversationId: string, userIds: string[], removedIds: string[]) {
    this.chatMembers.forget(conversationId);
    this.messagesSent += 1;
    const removed = new Set(removedIds);
    for (const uid of new Set(userIds)) {
      this.server
        .to(`user:${uid}`)
        .emit(SocketEvents.CHAT_CONVERSATION_UPDATED, { conversationId, removed: removed.has(uid) });
    }
  }

  /** One person's unread total changed (they read a thread on another screen). */
  emitChatBadge(userId: string, total: number) {
    this.messagesSent += 1;
    this.server.to(`user:${userId}`).emit(SocketEvents.CHAT_BADGE, { total });
  }

  // =========================================================================
  // GENERIC EMIT METHODS
  // =========================================================================

  /**
   * Emit an event to all clients in an organization
   */
  emitToOrganization(organizationId: string, event: string, data: unknown) {
    this.logger.log(`[EMIT] ${event} to org:${organizationId}`);
    this.messagesSent++;
    this.server.to(`org:${organizationId}`).emit(event, data);
  }

  /**
   * Emit an event to a specific user
   */
  emitToUser(userId: string, event: string, data: unknown) {
    this.logger.log(`[EMIT] ${event} to user:${userId}`);
    this.messagesSent++;
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Emit an event to all clients with a specific role
   */
  emitToRole(organizationId: string, role: string, event: string, data: unknown) {
    // Org-scoped: never broadcast to a global role room (sec audit C5).
    if (!organizationId) return;
    this.logger.log(`[EMIT] ${event} to role:${organizationId}:${role}`);
    this.messagesSent++;
    this.server.to(`role:${organizationId}:${role}`).emit(event, data);
  }
}

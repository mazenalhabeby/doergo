import { Injectable, Logger } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { PrismaService, SocketEvents, ticketCreatorId } from '@hbcfield/shared';
import { SocketRegistry } from './socket-registry';

/** Support live-chat: ticket events, the typing relay, and whether a human agent is online. */
@Injectable()
export class SupportEvents {
  private readonly logger = new Logger('WebSocketGateway');
  /**
   * Who raised a ticket — cached briefly, because typing fires per keystroke and
   * a ticket's creator never changes. Bounded so a stream of made-up ids cannot
   * grow it without limit.
   */
  private readonly ticketCreatorCache = new Map<string, { id: string | null; exp: number }>();

  constructor(
    private readonly registry: SocketRegistry,
    private readonly prisma: PrismaService,
  ) {}

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
    this.registry.messagesSent += 1;
    const evt = { ticketId: payload.ticketId, message: payload.message, ticket: payload.ticket };
    this.registry.server.to('support-agents').emit(SocketEvents.SUPPORT_MESSAGE, evt);
    if (!payload.isInternalNote) {
      this.registry.server.to(`user:${payload.customerId}`).emit(SocketEvents.SUPPORT_MESSAGE, evt);
    }
  }

  /** Ticket status/assignment/SLA changed → refresh the customer + agent views. */
  emitSupportTicketUpdated(ticket: { createdById?: string | null } & Record<string, unknown>) {
    this.registry.messagesSent += 1;
    const evt = { ticket };
    this.registry.server.to('support-agents').emit(SocketEvents.SUPPORT_TICKET_UPDATED, evt);
    if (ticket?.createdById) {
      this.registry.server.to(`user:${ticket.createdById}`).emit(SocketEvents.SUPPORT_TICKET_UPDATED, evt);
    }
  }

  /** SLA breached → agents only (escalation surfaces in the inbox). */
  emitSupportSlaBreached(ticket: Record<string, unknown>) {
    this.registry.messagesSent += 1;
    this.logger.warn(`[EMIT] support SLA breached: ticket ${ticket?.id}`);
    this.registry.server.to('support-agents').emit(SocketEvents.SUPPORT_TICKET_UPDATED, { ticket, slaBreached: true });
  }

  /** Tell every socket whether live chat is available (on the first agent in / the last out). */
  announceAgentPresence(online: boolean) {
    this.registry.server.emit(SocketEvents.SUPPORT_AGENT_PRESENCE, { online });
  }

  /**
   * Live-chat typing indicator relay. Customer → agents; agent → the ticket owner.
   *
   * ⚠️ Nothing here is taken from the client but the ticket id. It used to
   * relay to any `customerId` the payload named and trust `from` — so ANY
   * socket, authenticated or not, could put "…is typing" on any user's screen
   * and into the operator inbox. Now:
   *   - an AGENT socket (verified in authenticate_agent) reaches the ticket's
   *     own creator, read from the ticket;
   *   - an app user reaches the agents only for a ticket THEY raised;
   *   - everyone else (unauthenticated, portal customers) is ignored.
   */
  async relayTyping(client: Socket, payload: { ticketId: string }) {
    const ticketId = payload?.ticketId;
    if (!ticketId || typeof ticketId !== 'string' || ticketId.length > 64) return;

    const isAgent = this.registry.agentSockets.has(client.id);
    const member = this.registry.clients.get(client.id);
    // Portal customers have a live socket but no support surface.
    if (!isAgent && (!member || member.role === 'CUSTOMER')) return;

    const createdById = await this.ticketCreator(ticketId);
    if (!createdById) return;

    if (isAgent) {
      this.registry.server.to(`user:${createdById}`).emit(SocketEvents.SUPPORT_TYPING, { ticketId, from: 'AGENT' });
    } else if (member && member.userId === createdById) {
      this.registry.server.to('support-agents').emit(SocketEvents.SUPPORT_TYPING, { ticketId, from: 'CUSTOMER' });
    }
  }

  private async ticketCreator(ticketId: string): Promise<string | null> {
    const hit = this.ticketCreatorCache.get(ticketId);
    if (hit && hit.exp > Date.now()) return hit.id;
    const id: string | null = await ticketCreatorId(this.prisma, ticketId).catch(() => null);
    if (this.ticketCreatorCache.size >= 1000) this.ticketCreatorCache.clear();
    this.ticketCreatorCache.set(ticketId, { id, exp: Date.now() + 5 * 60_000 });
    return id;
  }
}

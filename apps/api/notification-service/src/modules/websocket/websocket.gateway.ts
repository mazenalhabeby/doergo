import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { instrument } from '@socket.io/admin-ui';
import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocketEvents, PrismaService } from '@hbcfield/shared';
import { typingRecipients } from './chat-members';
import { GatewayAuthBase } from './gateway-auth.base';

export { SOCKET_REVOCATION_EVENTS, type ClientInfo, type SocketStats } from './gateway.types';

/*
  The gateway is a chain, each part moved unchanged out of what was one 1,190-line
  class: gateway-core.base (state, access, disconnects, stats) → gateway-task-emits
  → gateway-presence → gateway-chat-emits → gateway-auth (the handshake bodies) →
  this class. The decorators and every @SubscribeMessage stay HERE, on the class
  Nest scans; the larger handlers call their body in gateway-auth.base.
*/
@WebSocketGateway({
  cors: {
    origin: (
      process.env.SOCKET_CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001,https://admin.socket.io'
    ).split(','),
    credentials: true,
  },
})
export class WebsocketGateway
  extends GatewayAuthBase
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  constructor(prisma: PrismaService, configService: ConfigService) {
    super(prisma, configService);
  }

  afterInit(server: Server) {
    this.logger.log('Socket.IO Gateway initialized');

    // Socket.IO Admin UI (https://admin.socket.io) — FAIL CLOSED: in production it
    // is only enabled when a non-empty SOCKET_ADMIN_PASSWORD is set, otherwise it
    // stays off (an unauthenticated Admin UI can inspect every socket and emit
    // arbitrary events).
    const isProduction = process.env.NODE_ENV === 'production';
    const adminPassword = process.env.SOCKET_ADMIN_PASSWORD;
    if (isProduction && !adminPassword) {
      this.logger.warn('Socket.IO Admin UI DISABLED — set SOCKET_ADMIN_PASSWORD to enable it in production.');
    } else {
      instrument(server, {
        auth: isProduction
          ? { type: 'basic', username: process.env.SOCKET_ADMIN_USER || 'admin', password: adminPassword as string }
          : false,
        mode: isProduction ? 'production' : 'development',
      });
      this.logger.log('Socket.IO Admin UI enabled at https://admin.socket.io');
    }

    // Per-socket message counters. NOTE: we deliberately do NOT stringify the
    // payload here — that ran on every inbound/outbound event and was pure CPU
    // waste. Event names only.
    server.use((socket, next) => {
      socket.onAny((event) => {
        this.messagesReceived++;
        this.logger.debug(`[RECV] ${socket.id} -> ${event}`);
      });
      socket.onAnyOutgoing((event) => {
        if (event !== 'disconnect') {
          this.messagesSent++;
          this.logger.debug(`[SEND] ${socket.id} <- ${event}`);
        }
      });
      next();
    });

    // Keep connected users "online" while their tab is open (see HEARTBEAT_MS).
    this.heartbeatTimer = setInterval(() => {
      void this.refreshConnectedPresence();
    }, this.HEARTBEAT_MS);
  }

  onModuleDestroy() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const timer of this.offlineTimers.values()) clearTimeout(timer);
    this.offlineTimers.clear();
  }

  handleConnection(client: Socket) {
    const clientIp = client.handshake.address;
    const userAgent = client.handshake.headers['user-agent'] || 'unknown';

    this.logger.log(`[CONNECT] Client ${client.id} from ${clientIp}`);
    this.logger.debug(`[CONNECT] User-Agent: ${userAgent.substring(0, 100)}`);

    // Send connection acknowledgment
    client.emit('connected', {
      socketId: client.id,
      timestamp: new Date().toISOString(),
      message: 'Connected to notification service',
    });

    // Reject sockets that never authenticate: disconnect after 15s if they
    // haven't sent a valid `authenticate` by then. Stops unauthenticated
    // connections from piling up (cheap resource exhaustion).
    (client as unknown as { __authTimer?: NodeJS.Timeout }).__authTimer = setTimeout(() => {
      if (!this.connectedClients.has(client.id)) {
        this.logger.warn(`[AUTH] Disconnecting ${client.id}: not authenticated within 15s`);
        client.disconnect(true);
      }
    }, 15000);
  }

  handleDisconnect(client: Socket) {
    const clientInfo = this.connectedClients.get(client.id);

    if (clientInfo) {
      this.logger.log(`[DISCONNECT] Client ${client.id} (user: ${clientInfo.userId}, role: ${clientInfo.role})`);
    } else {
      this.logger.log(`[DISCONNECT] Client ${client.id} (unauthenticated)`);
    }

    clearTimeout((client as unknown as { __authTimer?: NodeJS.Timeout }).__authTimer);
    clearTimeout((client as unknown as { __expiryTimer?: NodeJS.Timeout }).__expiryTimer);

    // Clean up event listeners to prevent memory leaks
    client.offAny();
    client.offAnyOutgoing();

    this.connectedClients.delete(client.id);

    // Support agent presence: if this was an agent socket and the last one, tell
    // customers live chat just went offline.
    if (this.agentSockets.delete(client.id) && !this.anyAgentOnline()) {
      this.server.emit(SocketEvents.SUPPORT_AGENT_PRESENCE, { online: false });
    }

    // Real-time offline: if this was the user's LAST socket, start a grace timer.
    // If they don't reconnect within the window AND they aren't on the clock,
    // clear lastActiveAt + broadcast offline so teammates' dashboards move them
    // to "Off Duty" immediately (instead of waiting out the 3-min stale window).
    if (clientInfo && !this.userHasActiveSocket(clientInfo.userId)) {
      this.scheduleOfflineCheck(clientInfo.userId, clientInfo.organizationId);
    }
  }

  @SubscribeMessage('authenticate')
  async handleAuthenticate(client: Socket, payload: { userId: string; role: string; organizationId: string }) {
    return this.authenticateClient(client, payload);
  }

  // Support agents (operator staff) authenticate with their CONSOLE token, not an
  // app JWT — they are not app users. They join the `support-agents` room to receive every
  // ticket event (including internal notes) and drive live-chat presence.
  @SubscribeMessage('authenticate_agent')
  async handleAuthenticateAgent(client: Socket) {
    return this.authenticateAgent(client);
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
  @SubscribeMessage('support_typing')
  async handleSupportTyping(client: Socket, payload: { ticketId: string }) {
    const ticketId = payload?.ticketId;
    if (!ticketId || typeof ticketId !== 'string' || ticketId.length > 64) return;

    const isAgent = this.agentSockets.has(client.id);
    const member = this.connectedClients.get(client.id);
    // Portal customers have a live socket but no support surface.
    if (!isAgent && (!member || member.role === 'CUSTOMER')) return;

    const createdById = await this.ticketCreator(ticketId);
    if (!createdById) return;

    if (isAgent) {
      this.server.to(`user:${createdById}`).emit(SocketEvents.SUPPORT_TYPING, { ticketId, from: 'AGENT' });
    } else if (member && member.userId === createdById) {
      this.server.to('support-agents').emit(SocketEvents.SUPPORT_TYPING, { ticketId, from: 'CUSTOMER' });
    }
  }

  /**
   * "I am looking at this conversation" (null: at none). A person reading a
   * thread gets no push for it — the message is already on their screen. Only
   * a conversation they are a member of is recorded.
   */
  @SubscribeMessage('chat_view')
  async handleChatView(client: Socket, payload: { conversationId?: string | null }) {
    const info = this.connectedClients.get(client.id);
    if (!info || info.role === 'CUSTOMER') return;
    const id = typeof payload?.conversationId === 'string' ? payload.conversationId : null;
    if (!id) {
      info.viewingConversationId = null;
      return;
    }
    const members = await this.chatMembers.members(id).catch(() => [] as string[]);
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
  @SubscribeMessage('chat_typing')
  async handleChatTyping(client: Socket, payload: { conversationId: string; recipientIds?: string[]; from?: string }) {
    const sender = this.connectedClients.get(client.id);
    // Portal customers are excluded from member chat entirely — reject any
    // chat-typing relay from a customer socket (spoof defense).
    if (!sender || sender.role === 'CUSTOMER') return;
    if (typeof payload?.conversationId !== 'string' || !payload.conversationId) return;

    // Recipients come from the conversation's membership, never from the client
    // (`recipientIds` is ignored). Organizations of everyone connected are read
    // from live sockets, so no recipient costs a database round trip.
    const members = await this.chatMembers.members(payload.conversationId).catch(() => [] as string[]);
    const orgByUser = new Map<string, string>();
    for (const info of this.connectedClients.values()) {
      if (info.role !== 'CUSTOMER') orgByUser.set(info.userId, info.organizationId);
    }
    const evt = { conversationId: payload.conversationId, from: sender.userId };
    for (const uid of typingRecipients(members, sender.userId, (id) => orgByUser.get(id), sender.organizationId)) {
      this.server.to(`user:${uid}`).emit(SocketEvents.CHAT_TYPING, evt);
    }
  }

  // Lets a client ask whether a human agent is online right now (live-chat gating).
  @SubscribeMessage('support_agent_presence')
  handleSupportAgentPresenceQuery() {
    return { online: this.anyAgentOnline() };
  }

  @SubscribeMessage('join_task')
  async handleJoinTask(client: Socket, payload: { taskId: string }) {
    return this.joinTask(client, payload);
  }

  @SubscribeMessage('leave_task')
  handleLeaveTask(client: Socket, payload: { taskId: string }) {
    const roomName = `task:${payload.taskId}`;
    client.leave(roomName);

    const clientInfo = this.connectedClients.get(client.id);
    if (clientInfo) {
      clientInfo.rooms = clientInfo.rooms.filter((r) => r !== roomName);
    }

    this.logger.log(`[LEAVE] Client ${client.id} left room ${roomName}`);
    return { success: true };
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket) {
    this.logger.debug(`[PING] Client ${client.id}`);
    return { pong: true, timestamp: Date.now() };
  }
}

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
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ChatEvents } from './chat-events';
import { MemberEvents } from './member-events';
import { PresenceService } from './presence.service';
import { SocketAuthenticator } from './socket-authenticator';
import { SocketRegistry } from './socket-registry';
import { SocketTokens } from './socket-tokens';
import { SupportEvents } from './support-events';
import { TaskEvents } from './task-events';
import { TaskRooms } from './task-rooms';

export { SOCKET_REVOCATION_EVENTS, type ClientInfo, type SocketStats } from './gateway.types';

/*
  The Socket.IO gateway: the class Nest scans, so the decorators, the lifecycle hooks
  and every @SubscribeMessage live here. The work is done by its collaborators —
  SocketRegistry owns the live state (server, sockets, agents, counters), and
  SocketTokens, SocketAuthenticator, PresenceService, TaskRooms and the emitters
  (TaskEvents, ChatEvents, SupportEvents, MemberEvents) each reach it explicitly.
  The public emit methods below are the surface every event handler calls.
*/
@WebSocketGateway({
  cors: {
    origin: (
      process.env.SOCKET_CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001,https://admin.socket.io'
    ).split(','),
    credentials: true,
  },
})
export class WebsocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('WebSocketGateway');

  constructor(
    private readonly registry: SocketRegistry,
    private readonly tokens: SocketTokens,
    private readonly authenticator: SocketAuthenticator,
    private readonly presence: PresenceService,
    private readonly taskRooms: TaskRooms,
    private readonly tasks: TaskEvents,
    private readonly chat: ChatEvents,
    private readonly support: SupportEvents,
    private readonly members: MemberEvents,
  ) {}

  afterInit(server: Server) {
    this.registry.attach(server);
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
        this.registry.messagesReceived++;
        this.logger.debug(`[RECV] ${socket.id} -> ${event}`);
      });
      socket.onAnyOutgoing((event) => {
        if (event !== 'disconnect') {
          this.registry.messagesSent++;
          this.logger.debug(`[SEND] ${socket.id} <- ${event}`);
        }
      });
      next();
    });

    this.presence.startHeartbeat();
  }

  onModuleDestroy() {
    this.presence.stop();
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
      if (!this.registry.clients.has(client.id)) {
        this.logger.warn(`[AUTH] Disconnecting ${client.id}: not authenticated within 15s`);
        client.disconnect(true);
      }
    }, 15000);
  }

  handleDisconnect(client: Socket) {
    const clientInfo = this.registry.clients.get(client.id);

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

    this.registry.clients.delete(client.id);

    // Support agent presence: if this was an agent socket and the last one, tell
    // customers live chat just went offline.
    if (this.registry.agentSockets.delete(client.id) && !this.registry.anyAgentOnline()) {
      this.support.announceAgentPresence(false);
    }

    // Real-time offline: if this was the user's LAST socket, start a grace timer.
    // If they don't reconnect within the window AND they aren't on the clock,
    // clear lastActiveAt + broadcast offline so teammates' dashboards move them
    // to "Off Duty" immediately (instead of waiting out the 3-min stale window).
    if (clientInfo && !this.registry.userHasActiveSocket(clientInfo.userId)) {
      this.presence.scheduleOfflineCheck(clientInfo.userId, clientInfo.organizationId);
    }
  }

  @SubscribeMessage('authenticate')
  async handleAuthenticate(client: Socket, payload: { userId: string; role: string; organizationId: string }) {
    return this.authenticator.authenticateClient(client, payload);
  }

  // Support agents (operator staff) authenticate with their CONSOLE token, not an
  // app JWT — they are not app users. They join the `support-agents` room to receive every
  // ticket event (including internal notes) and drive live-chat presence.
  @SubscribeMessage('authenticate_agent')
  async handleAuthenticateAgent(client: Socket) {
    return this.authenticator.authenticateAgent(client);
  }

  /** Live-chat typing relay — the target is read from the ticket (SupportEvents.relayTyping). */
  @SubscribeMessage('support_typing')
  async handleSupportTyping(client: Socket, payload: { ticketId: string }) {
    return this.support.relayTyping(client, payload);
  }

  /** "I am looking at this conversation" (null: at none) — no push for it (ChatEvents.viewConversation). */
  @SubscribeMessage('chat_view')
  async handleChatView(client: Socket, payload: { conversationId?: string | null }) {
    return this.chat.viewConversation(client, payload);
  }

  /** Chat typing — to the conversation's members in the sender's organization (ChatEvents.relayTyping). */
  @SubscribeMessage('chat_typing')
  async handleChatTyping(client: Socket, payload: { conversationId: string; recipientIds?: string[]; from?: string }) {
    return this.chat.relayTyping(client, payload);
  }

  // Lets a client ask whether a human agent is online right now (live-chat gating).
  @SubscribeMessage('support_agent_presence')
  handleSupportAgentPresenceQuery() {
    return { online: this.registry.anyAgentOnline() };
  }

  @SubscribeMessage('join_task')
  async handleJoinTask(client: Socket, payload: { taskId: string }) {
    return this.taskRooms.join(client, payload);
  }

  @SubscribeMessage('leave_task')
  handleLeaveTask(client: Socket, payload: { taskId: string }) {
    return this.taskRooms.leave(client, payload);
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket) {
    this.logger.debug(`[PING] Client ${client.id}`);
    return { pong: true, timestamp: Date.now() };
  }

  // =========================================================================
  // THE SURFACE EVENT HANDLERS AND THE HTTP CONTROLLER CALL
  // =========================================================================

  verifyStatsAccess = (authHeader: string | undefined) => this.tokens.verifyStatsAccess(authHeader);
  getStats = () => this.registry.getStats();
  getConnectedClients = () => this.registry.getConnectedClients();
  isViewingConversation = (userId: string, conversationId: string) =>
    this.registry.isViewingConversation(userId, conversationId);
  forceDisconnectUser: SocketRegistry['forceDisconnectUser'] = (...a) => this.registry.forceDisconnectUser(...a);
  disconnectOrganization: SocketRegistry['disconnectOrganization'] = (...a) =>
    this.registry.disconnectOrganization(...a);

  emitToOrganization: MemberEvents['emitToOrganization'] = (...a) => this.members.emitToOrganization(...a);
  emitToUser: MemberEvents['emitToUser'] = (...a) => this.members.emitToUser(...a);
  emitToRole: MemberEvents['emitToRole'] = (...a) => this.members.emitToRole(...a);
  emitAttendance: MemberEvents['emitAttendance'] = (...a) => this.members.emitAttendance(...a);
  emitClockIn: MemberEvents['emitClockIn'] = (...a) => this.members.emitClockIn(...a);
  emitClockOut: MemberEvents['emitClockOut'] = (...a) => this.members.emitClockOut(...a);
  emitBreakStarted: MemberEvents['emitBreakStarted'] = (...a) => this.members.emitBreakStarted(...a);
  emitBreakEnded: MemberEvents['emitBreakEnded'] = (...a) => this.members.emitBreakEnded(...a);
  emitPresenceChanged: PresenceService['emitPresenceChanged'] = (...a) => this.presence.emitPresenceChanged(...a);

  emitTaskCreated: TaskEvents['emitTaskCreated'] = (...a) => this.tasks.emitTaskCreated(...a);
  emitTaskAssigned: TaskEvents['emitTaskAssigned'] = (...a) => this.tasks.emitTaskAssigned(...a);
  emitTaskUpdated: TaskEvents['emitTaskUpdated'] = (...a) => this.tasks.emitTaskUpdated(...a);
  emitTaskDeleted: TaskEvents['emitTaskDeleted'] = (...a) => this.tasks.emitTaskDeleted(...a);
  emitTaskDeclined: TaskEvents['emitTaskDeclined'] = (...a) => this.tasks.emitTaskDeclined(...a);
  emitTaskStatusChanged: TaskEvents['emitTaskStatusChanged'] = (...a) => this.tasks.emitTaskStatusChanged(...a);
  announceTaskChanged: TaskEvents['announceTaskChanged'] = (...a) => this.tasks.announceTaskChanged(...a);
  emitCommentAdded: TaskEvents['emitCommentAdded'] = (...a) => this.tasks.emitCommentAdded(...a);
  emitAttachmentAdded: TaskEvents['emitAttachmentAdded'] = (...a) => this.tasks.emitAttachmentAdded(...a);
  emitWorkerLocationUpdated: TaskEvents['emitWorkerLocationUpdated'] = (...a) =>
    this.tasks.emitWorkerLocationUpdated(...a);
  emitSpaceChanged: TaskEvents['emitSpaceChanged'] = (...a) => this.tasks.emitSpaceChanged(...a);
  emitSpaceRosterChanged: TaskEvents['emitSpaceRosterChanged'] = (...a) => this.tasks.emitSpaceRosterChanged(...a);
  emitDocumentTypesChanged: TaskEvents['emitDocumentTypesChanged'] = (...a) =>
    this.tasks.emitDocumentTypesChanged(...a);

  emitChatMessage: ChatEvents['emitChatMessage'] = (...a) => this.chat.emitChatMessage(...a);
  emitChatRead: ChatEvents['emitChatRead'] = (...a) => this.chat.emitChatRead(...a);
  emitChatMessageChanged: ChatEvents['emitChatMessageChanged'] = (...a) => this.chat.emitChatMessageChanged(...a);
  emitChatMembersChanged: ChatEvents['emitChatMembersChanged'] = (...a) => this.chat.emitChatMembersChanged(...a);
  emitChatBadge: ChatEvents['emitChatBadge'] = (...a) => this.chat.emitChatBadge(...a);

  emitSupportMessage: SupportEvents['emitSupportMessage'] = (...a) => this.support.emitSupportMessage(...a);
  emitSupportTicketUpdated: SupportEvents['emitSupportTicketUpdated'] = (...a) =>
    this.support.emitSupportTicketUpdated(...a);
  emitSupportSlaBreached: SupportEvents['emitSupportSlaBreached'] = (...a) => this.support.emitSupportSlaBreached(...a);
}

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
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { SocketEvents, PrismaService } from '@hbcfield/shared';

export interface ClientInfo {
  userId: string;
  role: string;
  organizationId: string;
  connectedAt: Date;
  rooms: string[];
}

export interface SocketStats {
  totalConnections: number;
  authenticatedClients: number;
  connectionsByRole: Record<string, number>;
  connectionsByOrg: Record<string, number>;
  messagesReceived: number;
  messagesSent: number;
  uptime: number;
}

@WebSocketGateway({
  cors: {
    origin: (process.env.SOCKET_CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001,https://admin.socket.io').split(','),
    credentials: true,
  },
})
export class WebsocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('WebSocketGateway');
  private connectedClients = new Map<string, ClientInfo>();
  private startTime = Date.now();
  private messagesReceived = 0;
  private messagesSent = 0;
  private readonly jwtSecret: string;
  // Per-worker throttle for GPS location broadcasts (workerId -> last emit ms).
  private lastLocationEmit = new Map<string, number>();
  // Pending "mark offline" timers, keyed by userId. When a user's LAST socket
  // drops we wait out a grace window (survives refresh / reconnect / network
  // blips) before flipping them offline. A new authenticate cancels it.
  private offlineTimers = new Map<string, NodeJS.Timeout>();
  // Grace window before an ungraceful disconnect is treated as "offline".
  private readonly OFFLINE_GRACE_MS = 60000;
  // Server-side "still here" heartbeat: while a socket is connected the user is
  // online, even if their browser is idle and makes no API calls. We refresh
  // lastActiveAt for all connected users on this interval so an open-but-idle
  // tab never falls out of the 3-minute online window. One query per tick,
  // regardless of how many users are connected.
  private readonly HEARTBEAT_MS = 60000;
  private heartbeatTimer?: NodeJS.Timeout;

  // Support live-chat: socket ids of connected human agents (operator staff).
  // Presence = "is any agent online" → drives the customer's live-chat availability.
  private agentSockets = new Set<string>();
  private readonly platformAdminKey?: string;

  constructor(private readonly prisma: PrismaService, configService: ConfigService) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('CRITICAL: JWT_ACCESS_SECRET must be configured for socket authentication');
    }
    this.jwtSecret = secret;
    // Optional: agent sockets authenticate with this platform key (operator console).
    this.platformAdminKey = configService.get<string>('PLATFORM_ADMIN_KEY');
  }

  /** True if at least one human support agent socket is connected. */
  private anyAgentOnline(): boolean {
    return this.agentSockets.size > 0;
  }

  /** True if the user still has at least one authenticated socket connected. */
  private userHasActiveSocket(userId: string): boolean {
    for (const info of this.connectedClients.values()) {
      if (info.userId === userId) return true;
    }
    return false;
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

  /** Bump lastActiveAt for every currently-connected user in one query. */
  private async refreshConnectedPresence() {
    const userIds = new Set<string>();
    for (const info of this.connectedClients.values()) userIds.add(info.userId);
    if (userIds.size === 0) return;

    await this.prisma.user
      .updateMany({
        where: { id: { in: Array.from(userIds) } },
        data: { lastActiveAt: new Date() },
      })
      .catch((err) => this.logger.warn(`[PRESENCE] heartbeat failed: ${err}`));
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

  private scheduleOfflineCheck(userId: string, organizationId: string) {
    const existing = this.offlineTimers.get(userId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.offlineTimers.delete(userId);
      void this.markOfflineIfIdle(userId, organizationId);
    }, this.OFFLINE_GRACE_MS);

    this.offlineTimers.set(userId, timer);
  }

  private async markOnline(userId: string, organizationId: string, wasOffline: boolean) {
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { lastActiveAt: new Date() },
        select: { presence: true },
      });

      // Only broadcast on a real offline→online transition, so opening a second
      // tab or a socket reconnect doesn't spam every dashboard with refetches.
      if (wasOffline) {
        this.emitPresenceChanged(userId, updated.presence ?? 'AVAILABLE', organizationId);
      }
    } catch (err) {
      this.logger.warn(`[PRESENCE] online mark failed for user ${userId}: ${err}`);
    }
  }

  private async markOfflineIfIdle(userId: string, organizationId: string) {
    // Reconnected during the grace window? Leave them online.
    if (this.userHasActiveSocket(userId)) return;

    try {
      // Clocked-in guard: a technician driving or working on-site with the app
      // backgrounded is still "at work" — never mark them offline. Their clock-in
      // (a DB record) is untouched regardless.
      const openEntry = await this.prisma.timeEntry.findFirst({
        where: { userId, status: 'CLOCKED_IN' },
        select: { id: true },
      });
      if (openEntry) return;

      // Genuinely gone: clear last-active so they compute as offline, then push.
      await this.prisma.user
        .update({ where: { id: userId }, data: { lastActiveAt: null } })
        .catch(() => undefined);

      this.emitPresenceChanged(userId, null, organizationId);
    } catch (err) {
      this.logger.warn(`[PRESENCE] offline check failed for user ${userId}: ${err}`);
    }
  }

  @SubscribeMessage('authenticate')
  async handleAuthenticate(client: Socket, payload: { userId: string; role: string; organizationId: string }) {
    // Extract token from socket handshake auth
    const token = client.handshake?.auth?.token;

    if (!token || token === 'web-dashboard') {
      this.logger.warn(`[AUTH] Client ${client.id} rejected: no valid JWT token provided`);
      return { success: false, error: 'Authentication token required' };
    }

    // Verify JWT token
    let decoded: any;
    try {
      // Pin the algorithm so a token can't force verification under a different
      // scheme (none-alg / RS↔HS confusion) — defense-in-depth (L10).
      decoded = jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] });
    } catch (err: any) {
      this.logger.warn(`[AUTH] Client ${client.id} rejected: invalid/expired token - ${err.message}`);
      return { success: false, error: 'Invalid or expired token' };
    }

    // Verify the token payload matches the authenticate payload
    const tokenUserId = decoded.sub || decoded.userId;
    if (tokenUserId !== payload.userId) {
      this.logger.warn(`[AUTH] Client ${client.id} rejected: userId mismatch (token: ${tokenUserId}, payload: ${payload.userId})`);
      return { success: false, error: 'User identity mismatch' };
    }

    // Use ONLY data from the verified token — never fall back to the
    // client-supplied payload (that let a socket self-assign any role/org room).
    const userId = tokenUserId;
    const role = decoded.role;
    const organizationId = decoded.organizationId;

    if (!role || !organizationId) {
      this.logger.warn(`[AUTH] Client ${client.id} rejected: token missing role/organization claims`);
      return { success: false, error: 'Token missing required claims' };
    }

    this.logger.log(`[AUTH] Client ${client.id} authenticated as user ${userId} (${role})`);

    const clientInfo: ClientInfo = {
      userId,
      role,
      organizationId,
      connectedAt: new Date(),
      rooms: [],
    };

    // External CUSTOMER: confine to their OWN user room only. Never join the
    // org/role/taskviewers rooms — otherwise a valid customer token would receive
    // org-wide staff attendance/presence/geofence/join-request events. Customers
    // have no staff-presence footprint and don't broadcast online status.
    if (role === 'CUSTOMER') {
      client.join(`user:${userId}`);
      clientInfo.rooms.push(`user:${userId}`);
      this.connectedClients.set(client.id, clientInfo);
      clearTimeout((client as unknown as { __authTimer?: NodeJS.Timeout }).__authTimer);
      this.logger.log(`[AUTH] Customer ${userId} confined to user room only`);
      return { success: true, rooms: clientInfo.rooms };
    }

    // Join organization room
    client.join(`org:${organizationId}`);
    clientInfo.rooms.push(`org:${organizationId}`);

    // Join role-specific room
    client.join(`role:${role}`);
    clientInfo.rooms.push(`role:${role}`);

    // Join user-specific room
    client.join(`user:${userId}`);
    clientInfo.rooms.push(`user:${userId}`);

    // "Task viewers" room — admins and members granted "view all tasks". Org-wide
    // task events go here instead of to the whole org, so plain employees don't
    // receive (or get the payload of) tasks they can't see.
    if (role === 'ADMIN' || decoded.canViewAllTasks === true) {
      client.join(`taskviewers:${organizationId}`);
      clientInfo.rooms.push(`taskviewers:${organizationId}`);
    }

    // Cross-org shared spaces: join a per-space room so this org's members receive
    // LIVE task events for spaces shared WITH them. Server-authoritative — the org
    // comes from the verified token and the shares from the DB, never from the
    // client. Owner-side members already get these via taskviewers:{ownerOrg}, so
    // they don't join here (no double-delivery). Once per connection; the query is
    // indexed on [guestOrgId,status] and returns nothing for the vast majority.
    try {
      const shares = await this.prisma.spaceShare.findMany({
        where: { guestOrgId: organizationId, status: 'ACTIVE' },
        select: { spaceId: true },
      });
      for (const s of shares) {
        client.join(`space:${s.spaceId}`);
        clientInfo.rooms.push(`space:${s.spaceId}`);
      }
      if (shares.length) this.logger.log(`[AUTH] ${userId} joined ${shares.length} shared-space room(s)`);
    } catch (e) {
      this.logger.warn(`[AUTH] shared-space room join failed for ${userId}: ${e}`);
    }

    // Authenticated — cancel the idle-disconnect timer.
    clearTimeout((client as unknown as { __authTimer?: NodeJS.Timeout }).__authTimer);

    // Reconnected within the grace window → cancel any pending "mark offline".
    const pendingOffline = this.offlineTimers.get(userId);
    if (pendingOffline) {
      clearTimeout(pendingOffline);
      this.offlineTimers.delete(userId);
    }

    // Was this user fully offline before this socket? (no other live socket)
    const wasOffline = !this.userHasActiveSocket(userId);

    this.connectedClients.set(client.id, clientInfo);

    // Mark them active immediately, and — only on a true offline→online flip —
    // broadcast so teammates' dashboards pull them back in without a refresh.
    // (Skipped for extra tabs/reconnects where they were already online.)
    void this.markOnline(userId, organizationId, wasOffline);

    this.logger.log(`[AUTH] Client ${client.id} joined rooms: ${clientInfo.rooms.join(', ')}`);

    // Seed current support agent presence to this socket — presence is otherwise
    // only broadcast on transitions, so a customer connecting while an agent is
    // already online would never learn live chat is available.
    client.emit(SocketEvents.SUPPORT_AGENT_PRESENCE, { online: this.anyAgentOnline() });

    return { success: true, rooms: clientInfo.rooms };
  }

  // Support agents (operator staff) authenticate with the platform key, NOT a JWT
  // — they are not app users. They join the `support-agents` room to receive every
  // ticket event (including internal notes) and drive live-chat presence.
  @SubscribeMessage('authenticate_agent')
  handleAuthenticateAgent(client: Socket) {
    const key = client.handshake?.auth?.platformKey;
    if (!this.platformAdminKey || !key || key !== this.platformAdminKey) {
      this.logger.warn(`[AUTH] Agent socket ${client.id} rejected: bad platform key`);
      return { success: false, error: 'Invalid platform key' };
    }
    clearTimeout((client as unknown as { __authTimer?: NodeJS.Timeout }).__authTimer);
    client.join('support-agents');
    const wasEmpty = !this.anyAgentOnline();
    this.agentSockets.add(client.id);
    this.logger.log(`[AUTH] Support agent socket ${client.id} joined support-agents`);
    // First agent online → tell customers live chat is available.
    if (wasEmpty) this.server.emit(SocketEvents.SUPPORT_AGENT_PRESENCE, { online: true });
    return { success: true };
  }

  // Live-chat typing indicator relay. Customer → agents; agent → the ticket owner.
  @SubscribeMessage('support_typing')
  handleSupportTyping(client: Socket, payload: { ticketId: string; customerId?: string; from: 'CUSTOMER' | 'AGENT' }) {
    // Portal customers have a live socket but no support surface — never let them
    // drive typing indicators into the operator inbox (spoof defense).
    if (this.connectedClients.get(client.id)?.role === 'CUSTOMER') return;
    if (!payload?.ticketId) return;
    const evt = { ticketId: payload.ticketId, from: payload.from };
    if (payload.from === 'CUSTOMER') {
      this.server.to('support-agents').emit(SocketEvents.SUPPORT_TYPING, evt);
    } else if (payload.customerId) {
      this.server.to(`user:${payload.customerId}`).emit(SocketEvents.SUPPORT_TYPING, evt);
    }
  }

  // Chat typing indicator — relayed to the other conversation members' user rooms.
  @SubscribeMessage('chat_typing')
  handleChatTyping(client: Socket, payload: { conversationId: string; recipientIds: string[]; from: string }) {
    // Portal customers are excluded from member chat entirely — reject any
    // chat-typing relay from a customer socket (spoof defense).
    if (this.connectedClients.get(client.id)?.role === 'CUSTOMER') return;
    if (!payload?.conversationId || !Array.isArray(payload.recipientIds)) return;
    const evt = { conversationId: payload.conversationId, from: payload.from };
    for (const uid of payload.recipientIds) {
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
    const clientInfo = this.connectedClients.get(client.id);

    if (!clientInfo || !clientInfo.organizationId) {
      this.logger.warn(`[JOIN] Client ${client.id} rejected: not authenticated`);
      return { success: false, error: 'Must authenticate before joining task rooms' };
    }

    // Cap task-room membership per socket (a client only ever views a handful of
    // tasks at once) — stops a socket from joining unbounded rooms.
    const taskRoomCount = clientInfo.rooms.filter((r) => r.startsWith('task:')).length;
    if (taskRoomCount >= 50) {
      this.logger.warn(`[JOIN] Client ${client.id} rejected: task-room limit reached`);
      return { success: false, error: 'Too many task subscriptions' };
    }

    // Tenant isolation (L1): the task room carries task.created/updated/status
    // events, so a client must only join rooms for tasks in its OWN org. Verify
    // ownership before joining — a bare task id must never grant cross-org access.
    if (!payload?.taskId || typeof payload.taskId !== 'string') {
      return { success: false, error: 'taskId is required' };
    }
    const task = await this.prisma.task.findFirst({
      where: { id: payload.taskId, organizationId: clientInfo.organizationId },
      select: { id: true },
    });
    if (!task) {
      this.logger.warn(`[JOIN] Client ${client.id} (org: ${clientInfo.organizationId}) rejected: task ${payload.taskId} not in org`);
      return { success: false, error: 'Task not found' };
    }

    const roomName = `task:${payload.taskId}`;
    if (clientInfo.rooms.includes(roomName)) return { success: true };
    client.join(roomName);
    clientInfo.rooms.push(roomName);

    this.logger.log(`[JOIN] Client ${client.id} (org: ${clientInfo.organizationId}) joined room ${roomName}`);
    return { success: true };
  }

  @SubscribeMessage('leave_task')
  handleLeaveTask(client: Socket, payload: { taskId: string }) {
    const roomName = `task:${payload.taskId}`;
    client.leave(roomName);

    const clientInfo = this.connectedClients.get(client.id);
    if (clientInfo) {
      clientInfo.rooms = clientInfo.rooms.filter(r => r !== roomName);
    }

    this.logger.log(`[LEAVE] Client ${client.id} left room ${roomName}`);
    return { success: true };
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket) {
    this.logger.debug(`[PING] Client ${client.id}`);
    return { pong: true, timestamp: Date.now() };
  }

  // =========================================================================
  // AUTH CHECK FOR STATS ENDPOINTS
  // =========================================================================

  /**
   * Verify a stats request token. Returns true if authorized.
   * Used by the notification controller to gate stats/clients endpoints.
   */
  verifyStatsAccess(authHeader: string | undefined): boolean {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return false;
    }
    const token = authHeader.slice(7);
    try {
      const decoded: any = jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] });
      // Only ADMIN can view socket stats (the token carries no fine-grained flags).
      return decoded.role === 'ADMIN';
    } catch {
      return false;
    }
  }

  // =========================================================================
  // FORCE DISCONNECT
  // =========================================================================

  /**
   * Force-disconnect all sockets for a given user (e.g., after removal from org).
   */
  forceDisconnectUser(userId: string) {
    let disconnected = 0;
    for (const [socketId, client] of this.connectedClients) {
      if (client.userId === userId) {
        const socket = this.server.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('force_disconnect', { reason: 'removed_from_organization' });
          socket.disconnect(true);
          disconnected++;
        }
        this.connectedClients.delete(socketId);
      }
    }
    if (disconnected > 0) {
      this.logger.log(`[FORCE_DISCONNECT] Disconnected ${disconnected} socket(s) for user ${userId}`);
    }
  }

  // =========================================================================
  // TASK DELETED EVENT
  // =========================================================================

  emitTaskDeleted(taskId: string, organizationId: string, spaceId?: string) {
    this.logger.log(`[EMIT] task.deleted (taskId: ${taskId}) to taskviewers:${organizationId}`);
    this.messagesSent++;
    let target = this.server.to(`taskviewers:${organizationId}`).to(`task:${taskId}`);
    // Cross-org shared-space guests live in space:{spaceId}, not taskviewers.
    if (spaceId) target = target.to(`space:${spaceId}`);
    target.emit(SocketEvents.TASK_DELETED, { taskId, organizationId });
  }

  // Get connection statistics
  getStats(): SocketStats {
    const connectionsByRole: Record<string, number> = {};
    const connectionsByOrg: Record<string, number> = {};

    this.connectedClients.forEach(client => {
      connectionsByRole[client.role] = (connectionsByRole[client.role] || 0) + 1;
      connectionsByOrg[client.organizationId] = (connectionsByOrg[client.organizationId] || 0) + 1;
    });

    return {
      totalConnections: this.server?.sockets?.sockets?.size || 0,
      authenticatedClients: this.connectedClients.size,
      connectionsByRole,
      connectionsByOrg,
      messagesReceived: this.messagesReceived,
      messagesSent: this.messagesSent,
      uptime: Date.now() - this.startTime,
    };
  }

  // Get list of connected clients (for debugging)
  getConnectedClients(): Array<ClientInfo & { socketId: string }> {
    return Array.from(this.connectedClients.entries()).map(([socketId, info]) => ({
      socketId,
      ...info,
    }));
  }

  // Emit methods called by notification controller
  // Cross-org shared-space guests live in `space:{spaceId}` (not taskviewers of the
  // owner org), so task events must also fan out there. Owner members get it via
  // taskviewers; guests via the space room — Socket.IO dedups any client in both.
  private taskTargets(task: any) {
    let t = this.server.to(`taskviewers:${task.organizationId}`);
    if (task.spaceId) t = t.to(`space:${task.spaceId}`);
    return t;
  }

  emitTaskCreated(task: any) {
    this.logger.log(`[EMIT] task.created to org:${task.organizationId}`);
    this.messagesSent++;
    this.taskTargets(task).emit(SocketEvents.TASK_CREATED, task);
  }

  emitTaskAssigned(task: any, workerId: string) {
    this.logger.log(`[EMIT] task.assigned to org:${task.organizationId} and user:${workerId}`);
    this.messagesSent += 2;
    this.taskTargets(task).emit(SocketEvents.TASK_ASSIGNED, task);
    this.server.to(`user:${workerId}`).emit(SocketEvents.TASK_ASSIGNED, task);
  }

  emitTaskUpdated(task: any) {
    this.logger.log(`[EMIT] task.updated to org:${task.organizationId}`);
    this.messagesSent++;
    this.taskTargets(task).emit(SocketEvents.TASK_UPDATED, task);
    if (task.assignedToId) {
      this.messagesSent++;
      this.server.to(`user:${task.assignedToId}`).emit(SocketEvents.TASK_UPDATED, task);
    }
  }

  emitTaskDeclined(task: any, declinedBy: any) {
    this.logger.log(`[EMIT] task.declined to org:${task.organizationId} (declined by: ${declinedBy?.firstName} ${declinedBy?.lastName})`);
    this.messagesSent += 2;
    // Notify the organization (dispatcher and client will see this)
    this.server.to(`taskviewers:${task.organizationId}`).emit(SocketEvents.TASK_DECLINED, { task, declinedBy });
    // Notify anyone watching this specific task
    this.server.to(`task:${task.id}`).emit(SocketEvents.TASK_DECLINED, { task, declinedBy });
  }

  emitTaskStatusChanged(task: any, oldStatus: string, newStatus: string) {
    this.logger.log(`[EMIT] task.statusChanged (${oldStatus} -> ${newStatus}) to task:${task.id}`);
    this.messagesSent++;
    const payload = { task, oldStatus, newStatus };
    // Single emit across the task room + org taskviewers + shared-space room + the
    // creator's own room. The creator room lets a portal CUSTOMER (confined to
    // user:{id}) watch their request update live; Socket.IO dedups a staff creator
    // who is also a taskviewer.
    let target = this.server.to(`task:${task.id}`).to(`taskviewers:${task.organizationId}`);
    if (task.spaceId) target = target.to(`space:${task.spaceId}`);
    if (task.createdById) target = target.to(`user:${task.createdById}`);
    target.emit(SocketEvents.TASK_STATUS_CHANGED, payload);
  }

  emitCommentAdded(taskId: string, comment: any) {
    this.logger.log(`[EMIT] task.commentAdded to task:${taskId}`);
    this.messagesSent++;
    this.server.to(`task:${taskId}`).emit(SocketEvents.TASK_COMMENT_ADDED, { taskId, comment });
  }

  emitAttachmentAdded(taskId: string, attachment: any) {
    this.logger.log(`[EMIT] task.attachmentAdded to task:${taskId}`);
    this.messagesSent++;
    this.server.to(`task:${taskId}`).emit(SocketEvents.TASK_ATTACHMENT_ADDED, { taskId, attachment });
  }

  emitWorkerLocationUpdated(workerId: string, location: any) {
    // Throttle: GPS points can arrive every few seconds — the live map only
    // needs ~1 update / 3s per worker, so we drop the in-between broadcasts.
    const now = Date.now();
    if (now - (this.lastLocationEmit.get(workerId) || 0) < 3000) return;
    this.lastLocationEmit.set(workerId, now);

    this.logger.debug(`[EMIT] worker.locationUpdated for worker ${workerId}`);
    this.messagesSent++;
    // Live-map viewers = admins (role room). Historical points are still stored
    // by tracking-service regardless of this throttle.
    this.server.to('role:ADMIN').emit(SocketEvents.WORKER_LOCATION_UPDATED, { workerId, location });
  }

  // =========================================================================
  // ATTENDANCE EVENTS
  // =========================================================================

  emitClockIn(userId: string, organizationId: string, timeEntry: any) {
    this.logger.log(`[EMIT] attendance.clockIn for user ${userId}`);
    this.messagesSent += 1;
    // Single de-duplicated emit: a socket in BOTH rooms (e.g. the user viewing
    // their own org) would otherwise receive two copies.
    this.server.to(`user:${userId}`).to(`org:${organizationId}`).emit(SocketEvents.CLOCK_IN, { userId, timeEntry });
  }

  emitClockOut(userId: string, organizationId: string, timeEntry: any) {
    this.logger.log(`[EMIT] attendance.clockOut for user ${userId}`);
    this.messagesSent += 1;
    this.server.to(`user:${userId}`).to(`org:${organizationId}`).emit(SocketEvents.CLOCK_OUT, { userId, timeEntry });
  }

  // =========================================================================
  // BREAK EVENTS
  // =========================================================================

  emitBreakStarted(userId: string, organizationId: string, breakData: any) {
    this.logger.log(`[EMIT] break.started for user ${userId}`);
    this.messagesSent += 1;
    this.server.to(`user:${userId}`).to(`org:${organizationId}`).emit(SocketEvents.BREAK_STARTED, { userId, break: breakData });
  }

  emitBreakEnded(userId: string, organizationId: string, breakData: any) {
    this.logger.log(`[EMIT] break.ended for user ${userId}`);
    this.messagesSent += 1;
    this.server.to(`user:${userId}`).to(`org:${organizationId}`).emit(SocketEvents.BREAK_ENDED, { userId, break: breakData });
  }

  // Availability (Available/Busy/Away) changed — org-wide (teammates see status
  // on dashboards / contact lists). Low frequency, so a plain org broadcast.
  emitPresenceChanged(userId: string, presence: string | null, organizationId: string) {
    this.logger.debug(`[EMIT] presence.changed for user ${userId} -> ${presence}`);
    this.messagesSent += 1;
    this.server.to(`org:${organizationId}`).emit(SocketEvents.PRESENCE_CHANGED, { userId, presence });
  }

  // =========================================================================
  // SUPPORT EVENTS
  // =========================================================================

  /** A new support message. Internal notes go to agents only; else customer + agents. */
  emitSupportMessage(payload: {
    ticketId: string;
    message: any;
    ticket: any;
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
  emitSupportTicketUpdated(ticket: any) {
    this.messagesSent += 1;
    const evt = { ticket };
    this.server.to('support-agents').emit(SocketEvents.SUPPORT_TICKET_UPDATED, evt);
    if (ticket?.createdById) {
      this.server.to(`user:${ticket.createdById}`).emit(SocketEvents.SUPPORT_TICKET_UPDATED, evt);
    }
  }

  /** SLA breached → agents only (escalation surfaces in the inbox). */
  emitSupportSlaBreached(ticket: any) {
    this.messagesSent += 1;
    this.logger.warn(`[EMIT] support SLA breached: ticket ${ticket?.id}`);
    this.server.to('support-agents').emit(SocketEvents.SUPPORT_TICKET_UPDATED, { ticket, slaBreached: true });
  }

  // =========================================================================
  // CHAT EVENTS (member-to-member)
  // =========================================================================

  /** Deliver a new chat message to every member's user room (incl. the sender's
   *  other devices) — they're already joined to user:{id} after authenticate. */
  emitChatMessage(payload: { conversationId: string; message: any; recipients: string[] }) {
    this.messagesSent += 1;
    const evt = { conversationId: payload.conversationId, message: payload.message };
    const targets = new Set<string>([...(payload.recipients || [])]);
    if (payload.message?.senderId) targets.add(payload.message.senderId);
    for (const uid of targets) {
      this.server.to(`user:${uid}`).emit(SocketEvents.CHAT_MESSAGE, evt);
    }
  }

  // =========================================================================
  // GENERIC EMIT METHODS
  // =========================================================================

  /**
   * Emit an event to all clients in an organization
   */
  emitToOrganization(organizationId: string, event: string, data: any) {
    this.logger.log(`[EMIT] ${event} to org:${organizationId}`);
    this.messagesSent++;
    this.server.to(`org:${organizationId}`).emit(event, data);
  }

  /**
   * Emit an event to a specific user
   */
  emitToUser(userId: string, event: string, data: any) {
    this.logger.log(`[EMIT] ${event} to user:${userId}`);
    this.messagesSent++;
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Emit an event to all clients with a specific role
   */
  emitToRole(role: string, event: string, data: any) {
    this.logger.log(`[EMIT] ${event} to role:${role}`);
    this.messagesSent++;
    this.server.to(`role:${role}`).emit(event, data);
  }
}

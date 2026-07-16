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
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { SocketEvents } from '@hbcfield/shared';

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
export class WebsocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('WebSocketGateway');
  private connectedClients = new Map<string, ClientInfo>();
  private startTime = Date.now();
  private messagesReceived = 0;
  private messagesSent = 0;
  private readonly jwtSecret: string;

  constructor(configService: ConfigService) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('CRITICAL: JWT_ACCESS_SECRET must be configured for socket authentication');
    }
    this.jwtSecret = secret;
  }

  afterInit(server: Server) {
    this.logger.log('Socket.IO Gateway initialized');

    // Enable Socket.IO Admin UI
    // Access at: https://admin.socket.io
    // Server URL: http://localhost:4001
    const isProduction = process.env.NODE_ENV === 'production';
    instrument(server, {
      auth: isProduction
        ? { type: 'basic', username: process.env.SOCKET_ADMIN_USER || 'admin', password: process.env.SOCKET_ADMIN_PASSWORD || '' }
        : false,
      mode: isProduction ? 'production' : 'development',
    });

    // Global middleware for connection logging
    server.use((socket, next) => {
      // Track this socket for message counting via event listeners
      socket.onAny((event, ...args) => {
        this.messagesReceived++;
        this.logger.debug(`[RECV] ${socket.id} -> ${event}: ${JSON.stringify(args).substring(0, 200)}`);
      });

      socket.onAnyOutgoing((event, ...args) => {
        if (event !== 'disconnect') {
          this.messagesSent++;
          this.logger.debug(`[SEND] ${socket.id} <- ${event}: ${JSON.stringify(args).substring(0, 200)}`);
        }
      });

      next();
    });

    this.logger.log('Socket.IO Admin UI enabled at https://admin.socket.io');
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
  }

  handleDisconnect(client: Socket) {
    const clientInfo = this.connectedClients.get(client.id);

    if (clientInfo) {
      this.logger.log(`[DISCONNECT] Client ${client.id} (user: ${clientInfo.userId}, role: ${clientInfo.role})`);
    } else {
      this.logger.log(`[DISCONNECT] Client ${client.id} (unauthenticated)`);
    }

    // Clean up event listeners to prevent memory leaks
    client.offAny();
    client.offAnyOutgoing();

    this.connectedClients.delete(client.id);
  }

  @SubscribeMessage('authenticate')
  handleAuthenticate(client: Socket, payload: { userId: string; role: string; organizationId: string }) {
    // Extract token from socket handshake auth
    const token = client.handshake?.auth?.token;

    if (!token || token === 'web-dashboard') {
      this.logger.warn(`[AUTH] Client ${client.id} rejected: no valid JWT token provided`);
      return { success: false, error: 'Authentication token required' };
    }

    // Verify JWT token
    let decoded: any;
    try {
      decoded = jwt.verify(token, this.jwtSecret);
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

    // Join organization room
    client.join(`org:${organizationId}`);
    clientInfo.rooms.push(`org:${organizationId}`);

    // Join role-specific room
    client.join(`role:${role}`);
    clientInfo.rooms.push(`role:${role}`);

    // Join user-specific room
    client.join(`user:${userId}`);
    clientInfo.rooms.push(`user:${userId}`);

    this.connectedClients.set(client.id, clientInfo);

    this.logger.log(`[AUTH] Client ${client.id} joined rooms: ${clientInfo.rooms.join(', ')}`);

    return { success: true, rooms: clientInfo.rooms };
  }

  @SubscribeMessage('join_task')
  handleJoinTask(client: Socket, payload: { taskId: string }) {
    const clientInfo = this.connectedClients.get(client.id);

    if (!clientInfo || !clientInfo.organizationId) {
      this.logger.warn(`[JOIN] Client ${client.id} rejected: not authenticated`);
      return { success: false, error: 'Must authenticate before joining task rooms' };
    }

    const roomName = `task:${payload.taskId}`;
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
      const decoded: any = jwt.verify(token, this.jwtSecret);
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

  emitTaskDeleted(taskId: string, organizationId: string) {
    this.logger.log(`[EMIT] task.deleted (taskId: ${taskId}) to org:${organizationId}`);
    this.messagesSent++;
    this.server.to(`org:${organizationId}`).emit(SocketEvents.TASK_DELETED, { taskId, organizationId });
    // Also notify anyone watching this specific task
    this.server.to(`task:${taskId}`).emit(SocketEvents.TASK_DELETED, { taskId, organizationId });
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
  emitTaskCreated(task: any) {
    this.logger.log(`[EMIT] task.created to org:${task.organizationId}`);
    this.messagesSent++;
    this.server.to(`org:${task.organizationId}`).emit(SocketEvents.TASK_CREATED, task);
  }

  emitTaskAssigned(task: any, workerId: string) {
    this.logger.log(`[EMIT] task.assigned to org:${task.organizationId} and user:${workerId}`);
    this.messagesSent += 2;
    this.server.to(`org:${task.organizationId}`).emit(SocketEvents.TASK_ASSIGNED, task);
    this.server.to(`user:${workerId}`).emit(SocketEvents.TASK_ASSIGNED, task);
  }

  emitTaskUpdated(task: any) {
    this.logger.log(`[EMIT] task.updated to org:${task.organizationId}`);
    this.messagesSent++;
    this.server.to(`org:${task.organizationId}`).emit(SocketEvents.TASK_UPDATED, task);
    if (task.assignedToId) {
      this.messagesSent++;
      this.server.to(`user:${task.assignedToId}`).emit(SocketEvents.TASK_UPDATED, task);
    }
  }

  emitTaskDeclined(task: any, declinedBy: any) {
    this.logger.log(`[EMIT] task.declined to org:${task.organizationId} (declined by: ${declinedBy?.firstName} ${declinedBy?.lastName})`);
    this.messagesSent += 2;
    // Notify the organization (dispatcher and client will see this)
    this.server.to(`org:${task.organizationId}`).emit(SocketEvents.TASK_DECLINED, { task, declinedBy });
    // Notify anyone watching this specific task
    this.server.to(`task:${task.id}`).emit(SocketEvents.TASK_DECLINED, { task, declinedBy });
  }

  emitTaskStatusChanged(task: any, oldStatus: string, newStatus: string) {
    this.logger.log(`[EMIT] task.statusChanged (${oldStatus} -> ${newStatus}) to task:${task.id}`);
    this.messagesSent += 2;
    this.server.to(`task:${task.id}`).emit(SocketEvents.TASK_STATUS_CHANGED, { task, oldStatus, newStatus });
    this.server.to(`org:${task.organizationId}`).emit(SocketEvents.TASK_STATUS_CHANGED, { task, oldStatus, newStatus });
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
    this.logger.debug(`[EMIT] worker.locationUpdated for worker ${workerId}`);
    this.messagesSent++;
    this.server.to('role:DISPATCHER').emit(SocketEvents.WORKER_LOCATION_UPDATED, { workerId, location });
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

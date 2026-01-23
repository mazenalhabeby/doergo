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
import { SocketEvents } from '@doergo/shared';

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
    origin: [
      'http://localhost:3000',  // Web app
      'http://localhost:3001',
      'http://localhost:3002',
      'https://admin.socket.io',  // Socket.IO Admin UI
    ],
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

  afterInit(server: Server) {
    this.logger.log('Socket.IO Gateway initialized');

    // Enable Socket.IO Admin UI
    // Access at: https://admin.socket.io
    // Server URL: http://localhost:4001
    instrument(server, {
      auth: false, // Set to true in production and configure auth
      mode: 'development',
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

    this.connectedClients.delete(client.id);
  }

  @SubscribeMessage('authenticate')
  handleAuthenticate(client: Socket, payload: { userId: string; role: string; organizationId: string }) {
    this.logger.log(`[AUTH] Client ${client.id} authenticating as user ${payload.userId} (${payload.role})`);

    const clientInfo: ClientInfo = {
      userId: payload.userId,
      role: payload.role,
      organizationId: payload.organizationId,
      connectedAt: new Date(),
      rooms: [],
    };

    // Join organization room
    client.join(`org:${payload.organizationId}`);
    clientInfo.rooms.push(`org:${payload.organizationId}`);

    // Join role-specific room
    client.join(`role:${payload.role}`);
    clientInfo.rooms.push(`role:${payload.role}`);

    // Join user-specific room
    client.join(`user:${payload.userId}`);
    clientInfo.rooms.push(`user:${payload.userId}`);

    this.connectedClients.set(client.id, clientInfo);

    this.logger.log(`[AUTH] Client ${client.id} joined rooms: ${clientInfo.rooms.join(', ')}`);

    return { success: true, rooms: clientInfo.rooms };
  }

  @SubscribeMessage('join_task')
  handleJoinTask(client: Socket, payload: { taskId: string }) {
    const roomName = `task:${payload.taskId}`;
    client.join(roomName);

    const clientInfo = this.connectedClients.get(client.id);
    if (clientInfo) {
      clientInfo.rooms.push(roomName);
    }

    this.logger.log(`[JOIN] Client ${client.id} joined room ${roomName}`);
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
}

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SocketEvents } from '@doergo/shared';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3001', 'http://localhost:3002'],
    credentials: true,
  },
})
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedClients = new Map<string, { userId: string; role: string }>();

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  @SubscribeMessage('authenticate')
  handleAuthenticate(client: Socket, payload: { userId: string; role: string; organizationId: string }) {
    this.connectedClients.set(client.id, { userId: payload.userId, role: payload.role });
    // Join organization room
    client.join(`org:${payload.organizationId}`);
    // Join role-specific room
    client.join(`role:${payload.role}`);
    // Join user-specific room
    client.join(`user:${payload.userId}`);
    return { success: true };
  }

  @SubscribeMessage('join_task')
  handleJoinTask(client: Socket, payload: { taskId: string }) {
    client.join(`task:${payload.taskId}`);
    return { success: true };
  }

  @SubscribeMessage('leave_task')
  handleLeaveTask(client: Socket, payload: { taskId: string }) {
    client.leave(`task:${payload.taskId}`);
    return { success: true };
  }

  // Emit methods called by notification controller
  emitTaskCreated(task: any) {
    this.server.to(`org:${task.organizationId}`).emit(SocketEvents.TASK_CREATED, task);
  }

  emitTaskAssigned(task: any, workerId: string) {
    this.server.to(`org:${task.organizationId}`).emit(SocketEvents.TASK_ASSIGNED, task);
    this.server.to(`user:${workerId}`).emit(SocketEvents.TASK_ASSIGNED, task);
  }

  emitTaskStatusChanged(task: any, oldStatus: string, newStatus: string) {
    this.server.to(`task:${task.id}`).emit(SocketEvents.TASK_STATUS_CHANGED, { task, oldStatus, newStatus });
    this.server.to(`org:${task.organizationId}`).emit(SocketEvents.TASK_STATUS_CHANGED, { task, oldStatus, newStatus });
  }

  emitCommentAdded(taskId: string, comment: any) {
    this.server.to(`task:${taskId}`).emit(SocketEvents.TASK_COMMENT_ADDED, { taskId, comment });
  }

  emitAttachmentAdded(taskId: string, attachment: any) {
    this.server.to(`task:${taskId}`).emit(SocketEvents.TASK_ATTACHMENT_ADDED, { taskId, attachment });
  }

  emitWorkerLocationUpdated(workerId: string, location: any) {
    // Emit to dispatcher users only
    this.server.to('role:DISPATCHER').emit(SocketEvents.WORKER_LOCATION_UPDATED, { workerId, location });
  }
}

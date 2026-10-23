import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { PrismaService } from '@hbcfield/shared';
import { resolveSocketAccess, socketMayOpenTask, type SocketAccess } from './socket-access';
import { ACCESS_TTL_MS, type ClientInfo } from './gateway.types';
import { SocketRegistry } from './socket-registry';

/** Following one task live: joining its room is READING it, so the API's own rule is asked. */
@Injectable()
export class TaskRooms {
  private readonly logger = new Logger('WebSocketGateway');

  constructor(
    private readonly registry: SocketRegistry,
    private readonly prisma: PrismaService,
  ) {}

  async join(client: Socket, payload: { taskId: string }) {
    const clientInfo = this.registry.clients.get(client.id);

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

    // Tenant isolation (L1) AND visibility: the task room carries the task's
    // full payload on every change, so joining it is READING the task. It used
    // to check only the organization — any member could subscribe to any task
    // in their company by id, including ones the API refuses them. Now the
    // API's own rule (`canAccessTask`) is asked, with access resolved from the
    // database. A refusal does not say whether the task exists.
    if (!payload?.taskId || typeof payload.taskId !== 'string' || payload.taskId.length > 64) {
      return { success: false, error: 'taskId is required' };
    }
    // Portal customers see their own requests through the portal, not task rooms.
    if (clientInfo.role === 'CUSTOMER') return { success: false, error: 'Task not found' };
    let allowed = false;
    try {
      const access = await this.freshAccess(clientInfo);
      allowed =
        !!access &&
        (await socketMayOpenTask(
          this.prisma,
          { userId: clientInfo.userId, organizationId: clientInfo.organizationId, ...access },
          payload.taskId,
        ));
    } catch (e) {
      this.logger.warn(`[JOIN] visibility check failed for ${client.id}: ${e}`);
      allowed = false; // fail closed
    }
    if (!allowed) {
      this.logger.warn(`[JOIN] Client ${client.id} (org: ${clientInfo.organizationId}) refused task ${payload.taskId}`);
      return { success: false, error: 'Task not found' };
    }

    const roomName = `task:${payload.taskId}`;
    if (clientInfo.rooms.includes(roomName)) return { success: true };
    client.join(roomName);
    clientInfo.rooms.push(roomName);

    this.logger.log(`[JOIN] Client ${client.id} (org: ${clientInfo.organizationId}) joined room ${roomName}`);
    return { success: true };
  }

  leave(client: Socket, payload: { taskId: string }) {
    const roomName = `task:${payload.taskId}`;
    client.leave(roomName);

    const clientInfo = this.registry.clients.get(client.id);
    if (clientInfo) {
      clientInfo.rooms = clientInfo.rooms.filter((r) => r !== roomName);
    }

    this.logger.log(`[LEAVE] Client ${client.id} left room ${roomName}`);
    return { success: true };
  }

  /** The socket's access, re-read from the database once it is a minute old. */
  private async freshAccess(info: ClientInfo): Promise<SocketAccess | null> {
    if (info.access && info.accessAt && Date.now() - info.accessAt < ACCESS_TTL_MS) return info.access;
    // The token's `iat` rides along so a cut-off moved since authenticate (a
    // password change, "sign out everywhere") also ends this socket's reads.
    const access = await resolveSocketAccess(this.prisma, info.userId, info.organizationId, info.tokenIat);
    if (access) {
      info.access = access;
      info.accessAt = Date.now();
    }
    return access;
  }
}

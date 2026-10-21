import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';

/**
 * A member's in-app notification inbox — the SOCKET deliveries this service records
 * (NotificationStore). Read and marked read here, by the service that owns `NotificationDelivery`
 * (docs/data-ownership.md, group F); it used to be answered by auth-service.
 * Always the caller's own rows: the gateway passes the session's id, never one from the body.
 */
@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  /** Recent notifications + the unread count. */
  async list(userId: string, limit?: number) {
    const take = Math.min(Math.max(limit || 30, 1), 100);
    const [items, unread] = await Promise.all([
      this.prisma.notificationDelivery.findMany({
        where: { recipientId: userId, channel: 'SOCKET' },
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, eventType: true, payload: true, readAt: true, createdAt: true },
      }),
      this.prisma.notificationDelivery.count({ where: { recipientId: userId, channel: 'SOCKET', readAt: null } }),
    ]);
    return { data: { items, unread } };
  }

  /** Mark read — every unread one, or only the given ids (still only the caller's). */
  async markRead(userId: string, ids?: string[]) {
    const where: { recipientId: string; readAt: null; id?: { in: string[] } } = { recipientId: userId, readAt: null };
    if (ids && ids.length) where.id = { in: ids };
    await this.prisma.notificationDelivery.updateMany({ where, data: { readAt: new Date() } });
    return { success: true };
  }
}

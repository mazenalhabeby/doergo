import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';

/**
 * Persists in-app notifications so recipients see them in the bell whenever they
 * log in — not only if they happened to be online when the event fired. Writes to
 * the notification_deliveries table (channel SOCKET). Best-effort: a persistence
 * failure never breaks live delivery.
 */
@Injectable()
export class NotificationStore {
  private readonly logger = new Logger('NotificationStore');

  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    recipientIds: Array<string | null | undefined>;
    organizationId?: string | null;
    eventType: string;
    title: string;
    body: string;
    link?: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    const ids = [...new Set((params.recipientIds || []).filter((id): id is string => !!id))];
    if (!ids.length || !params.organizationId) return;
    try {
      const now = new Date();
      await this.prisma.notificationDelivery.createMany({
        data: ids.map((recipientId) => ({
          recipientId,
          organizationId: params.organizationId as string,
          channel: 'SOCKET',
          status: 'DELIVERED',
          eventType: params.eventType,
          payload: {
            title: params.title,
            body: params.body,
            link: params.link ?? null,
            ...(params.data || {}),
          },
          sentAt: now,
          deliveredAt: now,
        })),
      });
    } catch (error) {
      this.logger.error(`Failed to persist notifications: ${error}`);
    }
  }
}

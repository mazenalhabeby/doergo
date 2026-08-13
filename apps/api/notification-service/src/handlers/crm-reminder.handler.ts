import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { NotificationStore } from '../common/notification-store.service';

/** A customer follow-up reminder came due → notify the rep who set it. */
@Controller()
export class CrmReminderHandler {
  private readonly logger = new Logger(CrmReminderHandler.name);

  constructor(
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly store: NotificationStore,
  ) {}

  @EventPattern('customer_reminder_due')
  async handle(@Payload() data: { organizationId: string; userId: string; customerId: string; customerName: string; body?: string }) {
    if (!data?.userId) return;
    const title = 'Follow-up reminder';
    const body = data.body?.trim() ? `${data.customerName}: ${data.body}` : `Follow up with ${data.customerName}`;
    const link = `/customers/${data.customerId}`;

    try {
      await this.pushService.sendToUser(data.userId, title, body, { link, customerId: data.customerId });
    } catch (e) {
      this.logger.warn(`reminder push failed: ${e}`);
    }

    this.websocketGateway.emitToUser(data.userId, 'customer.reminder', {
      customerId: data.customerId, customerName: data.customerName, body: data.body ?? '', timestamp: new Date().toISOString(),
    });

    await this.store.record({
      recipientIds: [data.userId],
      organizationId: data.organizationId,
      eventType: 'customer_reminder_due',
      title,
      body,
      link,
    });
  }
}

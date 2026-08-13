import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { NotificationStore } from '../common/notification-store.service';

const KIND_TITLE: Record<string, string> = {
  CALL: '📞 Call reminder',
  EMAIL: '✉️ Email reminder',
  MEETING: '👥 Meeting reminder',
  OTHER: '⏰ Follow-up reminder',
};

/** A customer follow-up reminder came due → notify every assigned manager. */
@Controller()
export class CrmReminderHandler {
  private readonly logger = new Logger(CrmReminderHandler.name);

  constructor(
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly store: NotificationStore,
  ) {}

  @EventPattern('customer_reminder_due')
  async handle(@Payload() data: {
    organizationId: string; userIds?: string[]; userId?: string; customerId: string; customerName: string;
    body?: string; reminderKind?: string; dueAt?: string | null;
  }) {
    // Back-compat: accept either userIds[] (new) or a single userId (old).
    const recipients = Array.from(new Set((data.userIds ?? (data.userId ? [data.userId] : [])).filter(Boolean)));
    if (recipients.length === 0) return;

    const title = KIND_TITLE[(data.reminderKind ?? 'OTHER').toUpperCase()] ?? KIND_TITLE.OTHER;
    const body = data.body?.trim() ? `${data.customerName}: ${data.body}` : `Follow up with ${data.customerName}`;
    const link = `/customers/${data.customerId}`;

    // Push + realtime, fanned out to every recipient (best-effort per user).
    await Promise.all(
      recipients.map(async (uid) => {
        try {
          await this.pushService.sendToUser(uid, title, body, { link, customerId: data.customerId, type: 'crm_reminder' });
        } catch (e) {
          this.logger.warn(`reminder push failed (${uid}): ${e}`);
        }
        this.websocketGateway.emitToUser(uid, 'customer.reminder', {
          customerId: data.customerId, customerName: data.customerName, body: data.body ?? '',
          reminderKind: data.reminderKind ?? 'OTHER', timestamp: new Date().toISOString(),
        });
      }),
    );

    await this.store.record({
      recipientIds: recipients,
      organizationId: data.organizationId,
      eventType: 'customer_reminder_due',
      title,
      body,
      link,
    });
  }
}

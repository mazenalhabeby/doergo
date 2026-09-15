import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { NotificationStore } from '../common/notification-store.service';
import { msg, type LocalizedText } from '../i18n/translate';

const REMINDER_KINDS = new Set(['CALL', 'EMAIL', 'MEETING', 'OTHER']);

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

    const kind = (data.reminderKind ?? 'OTHER').toUpperCase();
    const text: LocalizedText = {
      title: msg(`crm.reminder.${REMINDER_KINDS.has(kind) ? kind : 'OTHER'}` as 'crm.reminder.OTHER'),
      // The note is the rep's own words and is not translated.
      body: data.body?.trim()
        ? msg('crm.reminder.bodyNote', { customer: data.customerName, note: data.body })
        : msg('crm.reminder.body', { customer: data.customerName }),
    };
    const link = `/customers/${data.customerId}`;

    // Realtime to every recipient, then one push for all of them.
    for (const uid of recipients) {
      this.websocketGateway.emitToUser(uid, 'customer.reminder', {
        customerId: data.customerId, customerName: data.customerName, body: data.body ?? '',
        reminderKind: data.reminderKind ?? 'OTHER', timestamp: new Date().toISOString(),
      });
    }
    try {
      await this.pushService.sendToUsers(recipients, text, { link, customerId: data.customerId, type: 'crm_reminder' });
    } catch (e) {
      this.logger.warn(`reminder push failed: ${e}`);
    }

    await this.store.record({
      recipientIds: recipients,
      organizationId: data.organizationId,
      eventType: 'customer_reminder_due',
      text,
      link,
    });
  }
}

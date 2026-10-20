/** Events about clients: reminders due. */
import { event } from '../event';

export const customerReminderDueEvent = event<{
  organizationId: string;
  userIds?: string[];
  userId?: string;
  customerId: string;
  customerName: string;
  body?: string;
  reminderKind?: string;
  dueAt?: string | null;
}>('customer_reminder_due');

export const customerChangedEvent = event<{ organizationId: string; customerId?: string }>('customer_changed');

/** Events about support tickets, and scheduled report emails. */
import { event } from '../event';
import type { SentNotRead, SupportMessageFacts, SupportTicketFacts } from './events-types';

export const reportEmailEvent = event<{ recipients: string[]; subject: string; html: string }>('report_email');

export const supportTicketCreatedEvent = event<{ ticket: SupportTicketFacts }>('support_ticket_created');

export const supportMessageEvent = event<
  {
    ticketId: string;
    message: SupportMessageFacts;
    ticket: SupportTicketFacts;
    isInternalNote?: boolean;
    customerId: string;
  } & SentNotRead<'organizationId'>
>('support_message');

export const supportTicketUpdatedEvent = event<{ ticket: SupportTicketFacts }>('support_ticket_updated');

export const supportSlaBreachedEvent = event<{ ticket: SupportTicketFacts }>('support_sla_breached');

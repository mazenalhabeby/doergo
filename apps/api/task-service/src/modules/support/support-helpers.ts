import type { SupportAttachmentMessage } from '@hbcfield/shared/microservices';

type Attachment = SupportAttachmentMessage;

// Customers never see internal agent notes; agents see everything.
const publicMessageWhere = { isInternalNote: false } as const;

/** The SLA job of one ticket — one id, so scheduling and cancelling meet. */
function slaJobId(ticketId: string) {
  return `support-sla-${ticketId}`;
}

/** Who raised a ticket, as the screens show them. */
function createdBySelect() {
  return { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } };
}

export { Attachment, publicMessageWhere, slaJobId, createdBySelect };

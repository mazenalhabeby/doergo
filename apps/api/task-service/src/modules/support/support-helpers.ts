import type { SupportAttachmentMessage } from '@hbcfield/shared/microservices';

type Attachment = SupportAttachmentMessage;

// Customers never see internal agent notes; agents see everything.
const publicMessageWhere = { isInternalNote: false } as const;

export { Attachment, publicMessageWhere };

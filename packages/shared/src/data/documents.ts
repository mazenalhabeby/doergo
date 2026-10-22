/**
 * Published reads of auth-service's personnel file (`Document`, `DocumentType`) — see db.ts.
 * Owner: auth-service.
 */
import type { On } from './db';

/** A member's own live documents expiring in a window (not hidden from them) — ≤ 100. */
export function expiringDocumentsOf(
  db: On<'document', 'findMany'>,
  input: { organizationId: string; userId: string; from: Date; to: Date },
) {
  return db.document.findMany({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
      hiddenFromMember: false,
      status: { in: ['ISSUED', 'SIGNED', 'AWAITING_SIGNATURE'] },
      expiresOn: { gte: input.from, lte: input.to },
    },
    select: { id: true, title: true, expiresOn: true },
    take: 100,
  });
}

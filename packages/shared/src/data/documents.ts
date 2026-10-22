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

/** The organization's active credential types a workflow requires (its gate on assignment). */
export function credentialTypesFor(db: On<'documentType', 'findMany'>, organizationId: string, workflowId: string) {
  return db.documentType.findMany({
    where: { organizationId, isCredential: true, isActive: true, requiredForWorkflowIds: { has: workflowId } },
    select: { id: true, label: true },
  });
}

/** The issued or signed documents of these types these people hold, with their expiry. */
export function heldCredentials(
  db: On<'document', 'findMany'>,
  input: { organizationId: string; userIds: string[]; typeIds: string[] },
) {
  const { organizationId, userIds, typeIds } = input;
  // Every candidate in ONE query (credential-gate.spec pins this text).
  return db.document.findMany({
    where: {
      organizationId,
      userId: { in: userIds },
      typeId: { in: typeIds },
      status: { in: ['ISSUED', 'SIGNED'] },
    },
    select: { userId: true, typeId: true, expiresOn: true },
  });
}

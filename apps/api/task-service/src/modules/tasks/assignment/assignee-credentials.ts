import { BadRequestException } from '@nestjs/common';
import { PrismaService, heldCredentials, credentialTypesFor } from '@hbcfield/shared';
import { personName, credentialStanding, credentialBlocks } from '@hbcfield/shared';

/**
 * Refuse an assignment to somebody whose required credential is missing or expired.
 *
 * MISSING is as disqualifying as EXPIRED, deliberately. "You must hold a gas
 * certificate to do gas work" does not become untrue because nobody ever
 * uploaded one — and a gate that let an absent credential through would be
 * satisfied by never providing it.
 *
 * EXPIRING is not blocked. Losing a technician a month early causes exactly
 * the scramble this exists to prevent; that case is a reminder, not a refusal.
 */
export async function assertAssigneesAreQualified(
  prisma: PrismaService,
  userIds: string[],
  users: { id: string; firstName: string; lastName: string }[],
  workflowId?: string | null,
  organizationId?: string | null,
) {
  if (!workflowId || !organizationId) return;

  // The short-circuit. Indexed on [organizationId, isCredential]; an
  // organization that gates nothing gets an empty result and returns here,
  // before the second query is ever built.
  const gatingTypes = await credentialTypesFor(prisma, organizationId, workflowId);
  if (gatingTypes.length === 0) return;

  // What these people actually hold. One query for everyone, never one each.
  const held = await heldCredentials(prisma, { organizationId, userIds, typeIds: gatingTypes.map((t) => t.id) });

  const now = new Date();
  const valid = new Set<string>();
  for (const doc of held) {
    // A credential with no expiry does not lapse; one past its date does.
    if (!credentialBlocks(credentialStanding(doc.expiresOn, now))) {
      valid.add(`${doc.userId}:${doc.typeId}`);
    }
  }

  const problems: string[] = [];
  for (const user of users) {
    const missing = gatingTypes.filter((t) => !valid.has(`${user.id}:${t.id}`));
    if (missing.length > 0) {
      problems.push(`${personName(user)} (${missing.map((t) => t.label).join(', ')})`);
    }
  }

  if (problems.length > 0) {
    // Names the person AND the credential, because "cannot be assigned" on
    // its own sends a dispatcher hunting through settings.
    throw new BadRequestException(
      `Cannot assign — a required certificate is missing or expired: ${problems.join('; ')}`,
    );
  }
}

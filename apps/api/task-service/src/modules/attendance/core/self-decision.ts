import { isActiveAdmin, type On } from '@hbcfield/shared';
import { ForbiddenException } from '@nestjs/common';

/**
 * Nobody decides their own item — the second-party rule, written once.
 *
 * Approving hours, a manual entry, a correction, a day off or an expense exists
 * so that SOMEBODY ELSE sanctions it. A permission says "may you decide here?"
 * and nothing about whose item it is, so a shift leader holding
 * the attendance permissions could approve their own flagged shift, add hours to
 * their own record, approve their own leave, or accept their own fuel slip.
 *
 * The rule is the one overtime has carried since audit AT-B1, now shared rather
 * than re-written per flow:
 *
 *   A true org ADMIN is exempt: they are the owner, there is nobody above them,
 *   and in a one-person organization blocking this would leave the item
 *   impossible to decide at all. Everyone with DELEGATED authority — a space
 *   role grant, or `canManageUsers` — needs someone else.
 *
 * `prisma` is structurally typed so any service (and a test double) can pass
 * its client without this file importing the module that owns it.
 */
export interface SelfDecisionPrisma {
  /** Asked through the published reader `isActiveAdmin` (auth-service owns User). */
  user: On<'user', 'findFirst'>['user'];
  /** Present on the real client; a test double without it skips the stand-in rule. */
  approvalDelegation?: On<'approvalDelegation', 'findFirst'>['approvalDelegation'];
}

export async function assertNotSelfDecision(
  prisma: SelfDecisionPrisma,
  params: {
    deciderId: string | null | undefined;
    subjectId: string | null | undefined;
    organizationId: string;
    message: string;
  },
): Promise<void> {
  if (!params.deciderId || !params.subjectId) return;
  if (params.deciderId !== params.subjectId) {
    await assertNotStandingInFor(prisma, params.deciderId, params.subjectId, params.organizationId);
    return;
  }
  const owner = await isActiveAdmin(prisma, params.deciderId, params.organizationId);
  if (owner) return;
  throw new ForbiddenException({ message: params.message, code: 'SELF_DECISION' });
}

/**
 * A stand-in never decides about the person they cover: the leader is on leave
 * and their OWN requests go to somebody else, or a leader could pick the person
 * who signs their overtime. Judged with a day either side (no time zone lookup
 * on every decision) — it refuses slightly more, never less.
 */
async function assertNotStandingInFor(
  prisma: SelfDecisionPrisma,
  deciderId: string,
  subjectId: string,
  organizationId: string,
): Promise<void> {
  if (!prisma.approvalDelegation) return;
  const now = Date.now();
  const covering = await prisma.approvalDelegation.findFirst({
    where: {
      organizationId,
      fromUserId: subjectId,
      toUserId: deciderId,
      revokedAt: null,
      startsOn: { lte: new Date(now + 86_400_000) },
      endsOn: { gte: new Date(now - 86_400_000) },
    },
    select: { id: true },
  });
  if (covering) {
    throw new ForbiddenException({
      message: 'You are standing in for this person — their own requests go to someone ' + 'else.',
      code: 'STAND_IN_FOR_SUBJECT',
    });
  }
}

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
  user: {
    findFirst(args: {
      where: { id: string; organizationId: string; isActive: true; role: 'ADMIN' };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
}

export async function assertNotSelfDecision(
  prisma: SelfDecisionPrisma,
  params: { deciderId: string | null | undefined; subjectId: string | null | undefined; organizationId: string; message: string },
): Promise<void> {
  if (!params.deciderId || !params.subjectId || params.deciderId !== params.subjectId) return;
  const owner = await prisma.user.findFirst({
    where: { id: params.deciderId, organizationId: params.organizationId, isActive: true, role: 'ADMIN' },
    select: { id: true },
  });
  if (owner) return;
  throw new ForbiddenException({ message: params.message, code: 'SELF_DECISION' });
}

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@hbcfield/shared';

/** Which issue, and whether the caller takes part in it. */

export async function loadIssue(prisma: PrismaService, issueId: string, organizationId: string) {
  const issue = await prisma.shiftIssue.findFirst({ where: { id: issueId, organizationId } });
  if (!issue) throw new NotFoundException('Issue not found');
  return issue;
}

/**
 * May this caller open this issue?
 *
 * Reporter, dispatched worker, an org-wide manager — and now the person who
 * oversees the SPACE it happened on. They are the one the notification goes
 * to, so being refused the thread it points at was the whole feature failing
 * for exactly the people it is for.
 */
export function assertParticipant(
  issue: { reportedById: string; assignedToId: string | null; spaceId?: string | null },
  callerUserId: string,
  canManage: boolean,
  ledSpaceIds?: string[],
) {
  if (canManage) return;
  if (issue.reportedById === callerUserId) return;
  if (issue.assignedToId && issue.assignedToId === callerUserId) return;
  if (issue.spaceId && ledSpaceIds?.includes(issue.spaceId)) return;
  throw new ForbiddenException('Not your issue');
}

import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from './prisma/prisma.service';

/**
 * An id arriving from a client belongs to the tenant it claims to.
 *
 * Every one of these is the same question asked of a different table: the
 * caller handed us an id, and nothing about an id says whose it is. Left
 * unasked, a member of one organization can reach a row in another simply by
 * knowing — or guessing — its cuid.
 *
 * The checks existed already, written out inside the recurring-task service
 * after a security audit. Task creation never adopted them, so a task could be
 * created running on ANOTHER TENANT'S state machine. Written once here, so the
 * next path that takes an id from a client has the check to hand rather than a
 * precedent to copy and adapt.
 *
 * Deliberately BadRequest rather than NotFound: from the caller's side "this id
 * is not yours" and "this id does not exist" are the same fact, and saying
 * which would confirm the existence of another tenant's row.
 */

/**
 * The organization a check should be made against is the one the RESOURCE will
 * belong to, which is not always the caller's. A task created in a cross-org
 * shared space belongs to the space's owner, so its workflow must be the
 * owner's too — checking against the caller's org would be both wrong and, in
 * that direction, too permissive.
 */
export async function assertWorkflowInOrg(
  prisma: PrismaService,
  workflowId: string | null | undefined,
  organizationId: string,
): Promise<void> {
  if (!workflowId) return;
  const found = await prisma.statusWorkflow.findFirst({
    where: { id: workflowId, organizationId },
    select: { id: true },
  });
  if (!found) throw new BadRequestException('Task Type not found in this organization');
}

export async function assertSpaceInOrg(
  prisma: PrismaService,
  spaceId: string | null | undefined,
  organizationId: string,
): Promise<void> {
  if (!spaceId) return;
  const found = await prisma.companyLocation.findFirst({
    where: { id: spaceId, organizationId },
    select: { id: true },
  });
  if (!found) throw new BadRequestException('Space not found in this organization');
}

/**
 * Every id must resolve to a member of this organization.
 *
 * A foreign user id on an assignment gains read access and notifications on the
 * resource: task access short-circuits on "is this person assigned?" before any
 * organization comparison, so an assignment is itself a grant.
 */
export async function assertUsersInOrg(
  prisma: PrismaService,
  userIds: string[] | null | undefined,
  organizationId: string,
): Promise<void> {
  if (!userIds || userIds.length === 0) return;
  const unique = [...new Set(userIds)];
  const found = await prisma.user.findMany({
    where: { id: { in: unique }, organizationId },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    throw new BadRequestException('One or more assignees are not members of this organization');
  }
}

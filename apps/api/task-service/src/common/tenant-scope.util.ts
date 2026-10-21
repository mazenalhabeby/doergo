import { NotFoundException } from '@nestjs/common';
import { scopeAllows, type SpaceScopeIds } from '@hbcfield/shared';
import type { PrismaService } from '@hbcfield/shared';

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
 * ONE status for every refusal: 404. "This id is not yours", "this id does not
 * exist" and "this id is in a space you were not granted" are the same fact
 * from the caller's side — saying which would confirm the existence of another
 * tenant's row. (This file used to answer 400 while the private copies in the
 * space-roles and shifts services answered 404; the copies are gone and the
 * one rule answers what most of the product already did.)
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
  if (!found) throw new NotFoundException('Task Type not found in this organization');
}

export interface SpaceInOrgOptions {
  /**
   * The caller's granted spaces (`spacesGranting`): undefined = org-wide,
   * [ids] = only those, [] = none. A space outside it reads as absent, not as
   * forbidden.
   */
  scope?: SpaceScopeIds;
  /**
   * Refuse an ARCHIVED space (isActive = false). For WRITES that put something
   * new into a space — a shift, a rota line, a role assignment — an archived
   * workspace is somewhere nothing should arrive. Reads leave it off: the past
   * still lives there.
   */
  activeOnly?: boolean;
}

export async function assertSpaceInOrg(
  prisma: PrismaService,
  spaceId: string | null | undefined,
  organizationId: string,
  opts: SpaceInOrgOptions = {},
): Promise<void> {
  if (!spaceId) return;
  const found = await prisma.companyLocation.findFirst({
    where: { id: spaceId, organizationId, ...(opts.activeOnly ? { isActive: true } : {}) },
    select: { id: true },
  });
  if (!found || !scopeAllows(opts.scope, spaceId)) {
    throw new NotFoundException('Space not found in this organization');
  }
}

/**
 * One id must resolve to a member of this organization. Returns whether the
 * member is external — one query, both facts (the space-role grant path needs
 * the second to refuse an org-wide role to an outsider).
 */
export async function assertUserInOrg(
  prisma: PrismaService,
  userId: string,
  organizationId: string,
): Promise<{ id: string; isExternal: boolean }> {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: { id: true, isExternal: true },
  });
  if (!user) throw new NotFoundException('User not found in this organization');
  return user;
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
    throw new NotFoundException('One or more assignees are not members of this organization');
  }
}

/**
 * A client (CRM record) id from a client must be this organization's. A
 * template or a task carrying another tenant's customer id would join their
 * name, address and contact onto every job generated from it.
 */
export async function assertCustomerInOrg(
  prisma: PrismaService,
  customerId: string | null | undefined,
  organizationId: string,
): Promise<void> {
  if (!customerId) return;
  const found = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true },
  });
  if (!found) throw new NotFoundException('Client not found in this organization');
}

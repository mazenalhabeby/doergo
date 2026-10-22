import { ForbiddenException } from '@nestjs/common';
import { PrismaService, clientRef, unitRef } from '@hbcfield/shared';
import { notEndedWhere, Role, SELECTABLE_ASSET_WHERE } from '@hbcfield/shared';

/*
  Who may act on a task, and which ids a client put on it really belong to the
  organization — the checks the task collaborators share. Pure functions (the
  database is passed in), so every part asks the same question the same way.
*/

/**
 * Which of the record ids a client put on a task really belong to `orgId`?
 *
 * Returns, per key that was GIVEN (non-empty), the id when it is the org's
 * and `null` when it is not; keys not given are absent. One query per kind,
 * in parallel. Used by create() (which drops an unowned id) and update()
 * (which refuses it) so the two paths cannot validate differently — update
 * used to write all six straight through, so an id from another tenant was
 * stored and joined against.
 *
 * `portal` narrows the unit and asset to what that CUSTOMER holds — the same
 * rule their own list of holdings follows (and only active units / selectable
 * assets). Internally the office may still log work against a retired record.
 */
export async function resolveOwnedTaskRefs(
  prisma: PrismaService,
  orgId: string,
  refs: Partial<Record<'unitId' | 'assetId' | 'customerId' | 'phaseId' | 'sprintId' | 'epicId', unknown>>,
  portal?: { customerId: string | null },
): Promise<Partial<Record<'unitId' | 'assetId' | 'customerId' | 'phaseId' | 'sprintId' | 'epicId', string | null>>> {
  const id = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
  const portalCustomer = portal ? { customerId: portal.customerId || undefined } : {};
  const probes: Record<string, (v: string) => Promise<{ id: string } | null>> = {
    unitId: (v) => unitRef(prisma, v, orgId, portal),
    assetId: (v) =>
      prisma.asset.findFirst({
        where: { id: v, organizationId: orgId, ...(portal ? { ...portalCustomer, ...SELECTABLE_ASSET_WHERE } : {}) },
        select: { id: true },
      }),
    customerId: (v) => clientRef(prisma, v, orgId),
    phaseId: (v) => prisma.phase.findFirst({ where: { id: v, organizationId: orgId }, select: { id: true } }),
    sprintId: (v) => prisma.sprint.findFirst({ where: { id: v, organizationId: orgId }, select: { id: true } }),
    epicId: (v) => prisma.epic.findFirst({ where: { id: v, organizationId: orgId }, select: { id: true } }),
  };
  const out: Partial<Record<keyof typeof refs, string | null>> = {};
  await Promise.all(
    (Object.keys(refs) as (keyof typeof refs)[]).map(async (key) => {
      const v = id(refs[key]);
      if (!v) return;
      out[key] = (await probes[key](v)) ? v : null;
    }),
  );
  return out;
}

/**
 * May this caller put somebody on THIS task?
 *
 * The three assignee routes were `@RequirePermission('canAssignTasks')` — the
 * flat ORG column — so a supervisor who runs a site could not add a second
 * person to a job at that site, while their own task list showed it. Widening
 * the guard to accept a space grant moves the real decision here, where the
 * task's own space is known: an org-wide holder may assign anywhere, a
 * space-granted one only inside the spaces they hold.
 *
 * This is the enforcement, not a hint. The route takes a task id straight
 * from the caller, so without it a member granted "assign" in one space could
 * name any task in the organization.
 */
export function assertMayAssign(
  task: { spaceId: string | null },
  data: { userRole: string; canAssignTasks?: boolean; assignSpaceIds?: string[] },
) {
  if (data.userRole === Role.ADMIN) return;
  if (data.canAssignTasks === true) return;
  if (task.spaceId && data.assignSpaceIds?.includes(task.spaceId)) return;
  throw new ForbiddenException('You do not have permission to assign work on this task');
}

/**
 * May this caller add work UNDER an existing task?
 *
 * Subtasks and dependencies were `@RequirePermission('canCreateTasks')` — the
 * flat ORG column — so a supervisor granted "create tasks" by a space role
 * could open a job at their site and then be refused when breaking it into
 * steps or ordering it. The control was offered and the action was not.
 *
 * Widening the guard puts the real decision here, where the PARENT task's own
 * space is known. This is the enforcement, not a hint: the route takes a task
 * id straight from the caller, so without it a member granted in one space
 * could hang a subtask off any task in the organization.
 *
 * Same shape as assertMayAssign above, deliberately — one question asked one
 * way, so a reader who understands one understands both.
 */
export function assertMayCreateUnder(
  task: { spaceId: string | null },
  data: { userRole?: string; canCreateTasks?: boolean; createSpaceIds?: string[] },
) {
  if (data.userRole === Role.ADMIN) return;
  if (data.canCreateTasks === true) return;
  if (task.spaceId && data.createSpaceIds?.includes(task.spaceId)) return;
  throw new ForbiddenException('You do not have permission to add work to this task');
}

/**
 * A space-scoped assigner may only reach the people in that space.
 *
 * Their suggestion list is already narrowed to the site's roster, but the
 * route accepts a user id directly — so the check has to be here too, or the
 * narrowing is a suggestion rather than a boundary.
 */
export async function assertTargetIsInSpace(
  prisma: PrismaService,
  task: { spaceId: string | null },
  targetUserId: string,
  data: { userRole: string; canAssignTasks?: boolean; assignSpaceIds?: string[] },
) {
  if (data.userRole === Role.ADMIN || data.canAssignTasks === true) return;
  if (!task.spaceId) throw new ForbiddenException('You do not have permission to assign work on this task');
  const rostered = await prisma.spaceAssignment.findFirst({
    where: {
      userId: targetUserId,
      spaceId: task.spaceId,
      ...notEndedWhere(),
    },
    select: { id: true },
  });
  if (!rostered) {
    throw new ForbiddenException('That member is not in this workspace');
  }
}

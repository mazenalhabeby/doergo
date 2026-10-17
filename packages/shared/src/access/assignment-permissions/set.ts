/** Saving one person's permissions in one workspace — as a shared role when it equals one, else as their personal role. */
import {
  PERMISSION_KEYS,
  externalForbiddenIn,
  permissionsExceed,
  permissionsFromOrgRole,
  type PermissionSet,
} from '../../types/permissions';
import { personalRoleSlug, roleUsableOnAssignment } from '../personal-role';
import { whitelistPermissions } from '../permission-whitelist';
import { ROLE_COMBO_MESSAGES, roleComboProblem } from '../../billing/work-roles';
import {
  ASSIGNMENT_SELECT,
  AssignmentPermissionsError,
  grantedKey,
  sharedManagementRolesWhere,
  type AssignmentPermissionsDb,
  type AssignmentPermissionsResult,
  type SetAssignmentPermissionsInput,
} from './types';

/**
 * Put a shared role, or a set of keys, on one workspace assignment.
 *
 * Run it inside a transaction: it may upsert the personal role, move the
 * assignment and delete the old personal role, and those three must land
 * together.
 */
export async function setAssignmentPermissions(
  db: AssignmentPermissionsDb,
  input: SetAssignmentPermissionsInput,
): Promise<AssignmentPermissionsResult> {
  const assignment = await db.spaceAssignment.findFirst({
    where: {
      id: input.assignmentId,
      organizationId: input.organizationId,
      ...(input.spaceId ? { spaceId: input.spaceId } : {}),
    },
    select: ASSIGNMENT_SELECT,
  });
  if (!assignment) {
    throw new AssignmentPermissionsError(404, 'ASSIGNMENT_NOT_FOUND', 'Workspace member not found');
  }
  const isExternal = assignment.user?.isExternal === true;

  /*
    Your own permissions are not yours to change here. Raising them is capped
    by the ceiling anyway; LOWERING them is the trap — the org side learned it
    when an admin emptied the role they held and lost the whole navigation.
  */
  if (input.ceiling && input.actorId && input.actorId === assignment.userId) {
    throw new AssignmentPermissionsError(403, 'CANNOT_CHANGE_OWN', 'You cannot change your own permissions in this workspace');
  }

  /*
    Somebody who already holds more here than you may not be re-shaped by you —
    the same rule the role editors apply to a role above the editor. Otherwise
    a member allowed to give roles could strip the workspace's manager down to
    an observer.
  */
  const current = permissionsFromOrgRole(assignment.role?.permissions);
  if (input.ceiling && input.outrankCheck !== false && permissionsExceed(input.ceiling, current)) {
    throw new AssignmentPermissionsError(403, 'MEMBER_ABOVE_YOU', 'This person holds more in this workspace than you do');
  }

  // What is being asked for, as a set — and the shared role it names, if any.
  let target: PermissionSet;
  let chosenRole: { id: string; personalAssignmentId: string | null; kind: string } | null = null;
  if ('roleId' in input.choice) {
    const role = await db.accessRole.findFirst({
      where: { id: input.choice.roleId, organizationId: input.organizationId, isActive: true, scope: { in: ['SPACE', 'BOTH'] } },
      select: { id: true, permissions: true, kind: true, personalAssignmentId: true },
    });
    // Another person's personal role reads exactly like a role that does not exist.
    if (!role || !roleUsableOnAssignment(role, assignment.id)) {
      throw new AssignmentPermissionsError(404, 'ROLE_NOT_FOUND', 'Space role not found');
    }
    chosenRole = role;
    target = role.kind === 'WORK' ? {} : permissionsFromOrgRole(role.permissions);
  } else {
    // Space keys only, exactly `true` — an org key or a typo is dropped, never stored.
    target = whitelistPermissions(input.choice.permissions, 'space');
  }
  const hasGrant = grantedKey(target) !== '';

  // The two-role rule (a trade and a management role at once) and "a work role is not a management role".
  const combo = roleComboProblem({
    workRoleKind: assignment.workRoleId ? 'WORK' : null,
    managementRoleKind: chosenRole ? (chosenRole.kind as any) : hasGrant ? 'MANAGEMENT' : null,
    hasWorkRole: !!assignment.workRoleId,
    hasManagementRole: chosenRole ? true : hasGrant,
    allowSecondRole: assignment.allowSecondRole === true,
    isExternal,
  });
  if (combo) throw new AssignmentPermissionsError(400, combo, ROLE_COMBO_MESSAGES[combo]);

  if (isExternal) {
    const forbidden = externalForbiddenIn(target);
    if (forbidden.length) {
      throw new AssignmentPermissionsError(
        400,
        'EXTERNAL_PERMISSION_FORBIDDEN',
        'An external member cannot be given these permissions',
        { keys: forbidden },
      );
    }
  }
  if (input.ceiling && permissionsExceed(input.ceiling, target)) {
    const over = PERMISSION_KEYS.filter((k) => target[k] === true && input.ceiling![k] !== true);
    throw new AssignmentPermissionsError(403, 'GRANT_EXCEEDS_OWN', 'You cannot grant permissions beyond your own', { keys: over });
  }

  // Which role row ends up on the assignment.
  let roleId: string | null;
  let personal = false;
  if (chosenRole) {
    roleId = chosenRole.id;
    personal = chosenRole.personalAssignmentId === assignment.id;
  } else if (!hasGrant) {
    // Nothing granted is no role at all — not an empty personal role to tidy up later.
    roleId = null;
  } else {
    /*
      Exactly a shared role? Then it IS that role: "Observer" saved unchanged
      stays the External Observer, keeps following its built-in definition and
      shows under its own name everywhere. Built-ins first, then the role list's
      own order, so the answer does not depend on which was created last.
    */
    const pool = await db.accessRole.findMany({
      where: sharedManagementRolesWhere(input.organizationId),
      orderBy: [{ isSystem: 'desc' }, { position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, permissions: true },
    });
    const want = grantedKey(target);
    const match = pool.find((r) => grantedKey(permissionsFromOrgRole(r.permissions)) === want);
    if (match) {
      roleId = match.id;
    } else {
      const who = [assignment.user?.firstName, assignment.user?.lastName].filter(Boolean).join(' ').trim() || 'Member';
      const name = `${who} · ${assignment.space?.name ?? 'Workspace'}`.slice(0, 120);
      const role = await db.accessRole.upsert({
        where: { personalAssignmentId: assignment.id },
        create: {
          organizationId: input.organizationId,
          name,
          slug: personalRoleSlug(assignment.id),
          description: null,
          scope: 'SPACE',
          kind: 'MANAGEMENT',
          isSystem: false,
          isActive: true,
          permissions: target,
          personalAssignmentId: assignment.id,
        },
        update: { name, permissions: target, isActive: true },
        select: { id: true },
      });
      roleId = role.id;
      personal = true;
    }
  }

  if (roleId !== assignment.roleId) {
    await db.spaceAssignment.update({ where: { id: assignment.id }, data: { roleId } });
  }
  // A personal role nobody holds any more is deleted, not left to be found later.
  if (!personal) await db.accessRole.deleteMany({ where: { personalAssignmentId: assignment.id } });

  return { assignmentId: assignment.id, spaceId: assignment.spaceId, userId: assignment.userId, roleId, personal, permissions: target };
}

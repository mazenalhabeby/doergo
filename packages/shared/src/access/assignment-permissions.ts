import {
  PERMISSION_KEYS,
  externalForbiddenIn,
  permissionsExceed,
  permissionsFromOrgRole,
  type AccessPermissionKey,
  type PermissionSet,
} from '../types/permissions';
import { whitelistPermissions } from './permission-whitelist';
import { SHARED_ROLE_WHERE, personalRoleSlug, roleUsableOnAssignment } from './personal-role';
import {
  choiceFromPermissions,
  presetOfPermissions,
  type PermissionChoice,
  type PermissionPresetId,
} from './permission-levels';
import { roleComboProblem, ROLE_COMBO_MESSAGES } from '../billing/work-roles';
import { isObserverSeat } from '../billing/seats';
import { getAccessPlatforms, type AccessPlatform } from '../types/modules';

/**
 * WHAT ONE PERSON MAY DO IN ONE WORKSPACE — read and written in one place.
 *
 * The permission builder (docs/plans/external-role-builder.md) saves either a
 * shared role or a set of keys. A set of keys becomes the assignment's PERSONAL
 * role (`AccessRole.personalAssignmentId`) unless it is exactly a shared role,
 * in which case that role is used — so "Observer, unchanged" stays the
 * organization's External Observer role and keeps following its definition.
 *
 * ⚠️ ONE WRITER. Two doors put permissions on an assignment from here: the
 * builder (task-service, `PUT /spaces/:spaceId/members/:assignmentId/permissions`)
 * and accepting an external invitation that carried `spacePermissions`
 * (auth-service, inside the accept transaction). Each check below — the space
 * whitelist, the external allow-list, the grant ceiling, the two-role rule,
 * "never somebody else's personal role" — lives here once, so the two doors
 * cannot drift into granting different things from the same request.
 *
 * Refusals are thrown as `AssignmentPermissionsError` carrying an HTTP status
 * and a code: the shared package does not depend on Nest, and each service maps
 * it to its own exception (`toHttpRefusal` below gives them the parts).
 */

/** The structural slice of a Prisma client (or transaction) this needs. */
export interface AssignmentPermissionsDb {
  spaceAssignment: {
    findFirst(args: any): Promise<any>;
    update(args: any): Promise<any>;
  };
  accessRole: {
    findFirst(args: any): Promise<any>;
    findMany(args: any): Promise<any[]>;
    upsert(args: any): Promise<any>;
    deleteMany(args: any): Promise<{ count: number }>;
  };
}

export type AssignmentPermissionsErrorCode =
  | 'ASSIGNMENT_NOT_FOUND'
  | 'ROLE_NOT_FOUND'
  | 'EXTERNAL_PERMISSION_FORBIDDEN'
  | 'GRANT_EXCEEDS_OWN'
  | 'MEMBER_ABOVE_YOU'
  | 'CANNOT_CHANGE_OWN'
  | keyof typeof ROLE_COMBO_MESSAGES;

export class AssignmentPermissionsError extends Error {
  constructor(
    readonly status: 400 | 403 | 404,
    readonly code: AssignmentPermissionsErrorCode,
    message: string,
    readonly params?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AssignmentPermissionsError';
  }

  /** The body a service throws as its HTTP exception: message, code, params. */
  toBody(): { message: string; code: string; params?: Record<string, unknown> } {
    return { message: this.message, code: this.code, ...(this.params ? { params: this.params } : {}) };
  }
}

/** The granted keys of a set, as one comparable string. */
function grantedKey(p: PermissionSet): string {
  return PERMISSION_KEYS.filter((k) => p[k] === true).sort().join(',');
}

const ASSIGNMENT_SELECT = {
  id: true,
  organizationId: true,
  spaceId: true,
  userId: true,
  roleId: true,
  workRoleId: true,
  allowSecondRole: true,
  role: { select: { id: true, name: true, permissions: true, kind: true, personalAssignmentId: true } },
  user: { select: { isExternal: true, firstName: true, lastName: true } },
  space: { select: { name: true } },
} as const;

/** Shared MANAGEMENT roles a workspace assignment may hold — the matching pool and the picker. */
function sharedManagementRolesWhere(organizationId: string) {
  return {
    organizationId,
    ...SHARED_ROLE_WHERE,
    isActive: true,
    kind: 'MANAGEMENT',
    scope: { in: ['SPACE', 'BOTH'] },
  };
}

export type AssignmentPermissionsChoice = { roleId: string } | { permissions: unknown };

export interface SetAssignmentPermissionsInput {
  organizationId: string;
  assignmentId: string;
  /**
   * The workspace in the route. An assignment of another workspace reads as
   * not found, so a grant held in space A can never reach a person in space B.
   */
  spaceId?: string;
  choice: AssignmentPermissionsChoice;
  /**
   * What the actor may hand out HERE (their org grants ∪ this workspace's).
   * Null = no ceiling: an admin, or a caller that has already capped the set
   * (the invitation accept, which intersects with the inviter's ceiling).
   */
  ceiling: PermissionSet | null;
  /** Who is acting — refused on their own assignment when a ceiling applies. */
  actorId?: string | null;
  /**
   * Refuse to re-shape somebody who already holds more here than the actor
   * (default true whenever a ceiling applies). Callers that manage members
   * ORG-wide pass false — the org paths never had that rule, and adding it
   * here would refuse an office manager what the role screens still allow.
   */
  outrankCheck?: boolean;
}

export interface AssignmentPermissionsResult {
  assignmentId: string;
  spaceId: string;
  userId: string;
  roleId: string | null;
  /** True when the stored role is this assignment's own personal role. */
  personal: boolean;
  permissions: PermissionSet;
}

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

export interface AssignableRole {
  id: string;
  name: string;
  color: string | null;
  isSystem: boolean;
  permissions: PermissionSet;
}

export interface AssignmentPermissionsView {
  assignmentId: string;
  spaceId: string;
  userId: string;
  roleId: string | null;
  roleName: string | null;
  personal: boolean;
  preset: PermissionPresetId | null;
  permissions: PermissionSet;
  choice: PermissionChoice;
  isExternal: boolean;
  /** The €2 seat today — the person's whole grant (org role ∪ every workspace), as billing reads it. */
  observerSeat: boolean;
  platforms: AccessPlatform;
  /**
   * Shared roles this actor may put on this person: within the actor's ceiling
   * and, for an external member, inside the external allow-list.
   */
  assignableRoles: AssignableRole[];
}

/** Everything the builder shows for one assignment. Not found = another workspace or organization. */
export async function readAssignmentPermissions(
  db: AssignmentPermissionsDb,
  input: { organizationId: string; assignmentId: string; spaceId: string; ceiling: PermissionSet | null },
): Promise<AssignmentPermissionsView> {
  const assignment = await db.spaceAssignment.findFirst({
    where: { id: input.assignmentId, organizationId: input.organizationId, spaceId: input.spaceId },
    select: {
      id: true,
      spaceId: true,
      userId: true,
      roleId: true,
      role: { select: { id: true, name: true, permissions: true, personalAssignmentId: true } },
      user: {
        select: {
          isExternal: true,
          enabledModules: true,
          memberRole: { select: { permissions: true } },
          // The same window billing counts (org-bill.service): every assignment not yet ended.
          spaceAssignments: {
            where: { OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] },
            select: { role: { select: { permissions: true } } },
          },
        },
      },
    },
  });
  if (!assignment) {
    throw new AssignmentPermissionsError(404, 'ASSIGNMENT_NOT_FOUND', 'Workspace member not found');
  }
  const permissions = permissionsFromOrgRole(assignment.role?.permissions);
  const isExternal = assignment.user?.isExternal === true;

  const held = new Set<string>();
  const add = (p: unknown) => {
    for (const k of PERMISSION_KEYS) if (permissionsFromOrgRole(p)[k] === true) held.add(k);
  };
  add(assignment.user?.memberRole?.permissions);
  for (const a of assignment.user?.spaceAssignments ?? []) add(a.role?.permissions);

  const pool = await db.accessRole.findMany({
    where: sharedManagementRolesWhere(input.organizationId),
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, color: true, isSystem: true, permissions: true },
  });
  const assignableRoles: AssignableRole[] = pool
    .map((r) => ({ id: r.id, name: r.name, color: r.color ?? null, isSystem: r.isSystem === true, permissions: permissionsFromOrgRole(r.permissions) }))
    .filter((r) => !isExternal || externalForbiddenIn(r.permissions).length === 0)
    .filter((r) => !input.ceiling || !permissionsExceed(input.ceiling, r.permissions));

  return {
    assignmentId: assignment.id,
    spaceId: assignment.spaceId,
    userId: assignment.userId,
    roleId: assignment.roleId ?? null,
    roleName: assignment.role?.name ?? null,
    personal: !!assignment.role?.personalAssignmentId,
    preset: presetOfPermissions(permissions),
    permissions,
    choice: choiceFromPermissions(permissions),
    isExternal,
    observerSeat: isObserverSeat({ isExternal }, [...held] as AccessPermissionKey[]),
    platforms: getAccessPlatforms({ enabledModules: assignment.user?.enabledModules }),
    assignableRoles,
  };
}

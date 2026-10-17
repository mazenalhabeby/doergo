/** What the permission builder reads and writes: the database it needs, its refusals, its input and result. */
import { ROLE_COMBO_MESSAGES, type RoleKindValue } from '../../billing/work-roles';
import { PERMISSION_KEYS, type PermissionSet } from '../../types/permissions';
import { SHARED_ROLE_WHERE } from '../personal-role';

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

/**
 * The structural slice of a Prisma client (or transaction) this needs. Each row type is the
 * union of what the reads here select (relations optional: a read that does not select one
 * does not read it), so any Prisma client satisfies it without shared naming a service.
 */
export interface AssignmentPermissionsDb {
  spaceAssignment: {
    findFirst(args: unknown): Promise<AssignmentRow | null>;
    update(args: unknown): Promise<unknown>;
  };
  accessRole: {
    findFirst(args: unknown): Promise<AccessRoleRow | null>;
    findMany(args: unknown): Promise<AccessRoleRow[]>;
    upsert(args: unknown): Promise<{ id: string }>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
}

/** A workspace assignment as ASSIGNMENT_SELECT (set) or the builder read (read) selects it. */
export interface AssignmentRow {
  id: string;
  spaceId: string;
  userId: string;
  roleId: string | null;
  workRoleId?: string | null;
  allowSecondRole?: boolean;
  role?: { id?: string; name?: string; permissions: unknown; personalAssignmentId?: string | null } | null;
  space?: { name: string } | null;
  user?: {
    isExternal?: boolean;
    firstName?: string | null;
    lastName?: string | null;
    enabledModules?: unknown;
    memberRole?: { permissions: unknown } | null;
    spaceAssignments?: Array<{ role: { permissions: unknown } | null }>;
  } | null;
}

/** An access role as the reads here select it. */
export interface AccessRoleRow {
  id: string;
  name: string;
  permissions: unknown;
  kind?: RoleKindValue;
  color?: string | null;
  isSystem?: boolean;
  personalAssignmentId?: string | null;
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
  return PERMISSION_KEYS.filter((k) => p[k] === true)
    .sort()
    .join(',');
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

export { grantedKey, ASSIGNMENT_SELECT, sharedManagementRolesWhere };

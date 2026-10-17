/** Reading one person's permissions in one workspace for the builder. */
import {
  PERMISSION_KEYS,
  externalForbiddenIn,
  permissionsExceed,
  permissionsFromOrgRole,
  type AccessPermissionKey,
  type PermissionSet,
} from '../../types/permissions';
import {
  choiceFromPermissions,
  presetOfPermissions,
  type PermissionChoice,
  type PermissionPresetId,
} from '../permission-levels';
import { getAccessPlatforms, type AccessPlatform } from '../../types/modules';
import { notEndedWhere } from '../assignment-window';
import { isObserverSeat } from '../../billing/seats';
import { AssignmentPermissionsError, sharedManagementRolesWhere, type AssignmentPermissionsDb } from './types';

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
            where: { ...notEndedWhere() },
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

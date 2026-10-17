import { rpc } from '../contract';
import type { AssignmentPermissionsChoice } from '../../access/assignment-permissions/types';
import type { PermissionSet } from '../../types/permissions/keys';
import type { RoleKindValue } from '../../billing/work-roles';
import type { SpaceMemberAuthorityMessage } from './task-service-2-types';

/** task-service `space-roles` handlers — the request each one reads. */

export const listSpaceRoles = rpc<{ organizationId: string }>('list_space_roles');
export const createSpaceRole = rpc<{
  organizationId: string;
  name: string;
  description?: string;
  color?: string;
  permissions?: PermissionSet;
  kind?: RoleKindValue;
  spaceId?: string;
}>('create_space_role');
export const updateSpaceRole = rpc<{
  organizationId: string;
  roleId: string;
  name?: string;
  description?: string;
  color?: string;
  permissions?: PermissionSet;
  isActive?: boolean;
  kind?: RoleKindValue;
  requesterPerms?: null | PermissionSet;
}>('update_space_role');
export const setWorkRoleHere = rpc<{ organizationId: string; spaceId: string; roleId: string; active: boolean }>(
  'set_work_role_here',
);
export const mergeSpaceRole = rpc<{ organizationId: string; roleId: string; intoRoleId: string }>('merge_space_role');
export const deleteSpaceRole = rpc<{ organizationId: string; roleId: string }>('delete_space_role');
export const listSpaceMembers = rpc<{ organizationId: string; spaceId: string }>('list_space_members');
export const assignSpaceMember = rpc<{
  organizationId: string;
  spaceId: string;
  userId: string;
  spaceRoleId?: null | string;
  createdById?: string;
  requesterPerms?: null | PermissionSet;
  authority?: SpaceMemberAuthorityMessage;
  outrankCheck?: boolean;
}>('assign_space_member');
export const removeSpaceMember = rpc<{
  organizationId: string;
  spaceId: string;
  memberId: string;
  outrankPerms?: null | PermissionSet;
}>('remove_space_member');
export const getSpaceMemberPermissions = rpc<{
  organizationId: string;
  spaceId: string;
  assignmentId: string;
  requesterPerms?: null | PermissionSet;
}>('get_space_member_permissions');
export const setSpaceMemberPermissions = rpc<{
  organizationId: string;
  spaceId: string;
  assignmentId: string;
  choice: AssignmentPermissionsChoice;
  requesterPerms?: null | PermissionSet;
  requesterId?: string;
  outrankCheck?: boolean;
}>('set_space_member_permissions');
export const listSpaceRolesInSpace = rpc<{ organizationId: string; spaceId: string }>('list_space_roles_in_space');
export const setSpaceRoleDayRate = rpc<{
  organizationId: string;
  spaceId: null | string;
  roleId: string;
  cents: null | number;
  effectiveFrom?: string;
  createdById?: string;
}>('set_space_role_day_rate');
export const listRateHistory = rpc<{
  organizationId: string;
  target: 'ORGANIZATION' | 'SPACE' | 'MEMBER' | 'ASSIGNMENT';
  targetId: string;
  kinds: ('BILL_HOUR' | 'COST_HOUR' | 'COST_DAY')[];
  spaceId?: string;
}>('list_rate_history');
export const updateSpaceMemberRoles = rpc<{
  organizationId: string;
  spaceId: string;
  memberId: string;
  workRoleId?: null | string;
  managementRoleId?: null | string;
  allowSecondRole?: boolean;
  billBy?: null | 'HOUR' | 'DAY' | 'BOTH';
  hoursBasis?: null | 'COUNTED' | 'CLOCKED' | 'SHIFT';
  requesterPerms?: null | PermissionSet;
  authority?: SpaceMemberAuthorityMessage;
  outrankCheck?: boolean;
}>('update_space_member_roles');
export const updateSpaceMemberRate = rpc<{
  organizationId: string;
  spaceId: string;
  memberId: string;
  billRateCents?: null | number;
  costRateCents?: null | number;
  costDayCents?: null | number;
  effectiveFrom?: string;
  createdById?: string;
}>('update_space_member_rate');
export const updateSpaceMemberRouting = rpc<{
  organizationId: string;
  spaceId: string;
  memberId: string;
  notifyRoleIds?: string[];
  notifyUserIds?: string[];
  contactRoleIds?: string[];
  contactUserIds?: string[];
  approveRoleIds?: string[];
  approveUserIds?: string[];
}>('update_space_member_routing');

import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  SERVICE_NAMES,
  BaseGatewayService,
  type PermissionSet,
  type BillByValue,
  type RoleKindValue,
} from '@hbcfield/shared';
import type { SpaceMemberAuthority } from './space-member-access';
import {
  pattern,
  assignSpaceMember,
  createSpaceRole,
  deleteSpaceRole,
  getSpaceMemberPermissions,
  listRateHistory,
  listSpaceMembers,
  listSpaceRoles,
  listSpaceRolesInSpace,
  mergeSpaceRole,
  removeSpaceMember,
  setSpaceMemberPermissions,
  setSpaceRoleDayRate,
  setWorkRoleHere,
  updateSpaceMemberRate,
  updateSpaceMemberRoles,
  updateSpaceMemberRouting,
  updateSpaceRole,
  type RpcRequest,
} from '@hbcfield/shared/microservices';

@Injectable()
export class SpaceRolesService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, SpaceRolesService.name);
  }

  // Roles
  listRoles(data: { organizationId: string }) {
    return this.send(pattern(listSpaceRoles), data satisfies RpcRequest<typeof listSpaceRoles>);
  }
  createRole(data: {
    organizationId: string;
    name: string;
    description?: string;
    color?: string;
    permissions?: PermissionSet;
    kind?: RoleKindValue;
    spaceId?: string;
  }) {
    return this.send(pattern(createSpaceRole), data satisfies RpcRequest<typeof createSpaceRole>);
  }
  updateRole(data: {
    organizationId: string;
    roleId: string;
    name?: string;
    description?: string;
    color?: string;
    permissions?: PermissionSet;
    isActive?: boolean;
    kind?: RoleKindValue;
    /** Ceiling for what the caller may author. Null = admin, no ceiling. */
    requesterPerms?: PermissionSet | null;
  }) {
    return this.send(pattern(updateSpaceRole), data satisfies RpcRequest<typeof updateSpaceRole>);
  }
  setWorkRoleHere(data: { organizationId: string; spaceId: string; roleId: string; active: boolean }) {
    return this.send(pattern(setWorkRoleHere), data satisfies RpcRequest<typeof setWorkRoleHere>);
  }

  mergeRole(data: { organizationId: string; roleId: string; intoRoleId: string }) {
    return this.send(pattern(mergeSpaceRole), data satisfies RpcRequest<typeof mergeSpaceRole>);
  }

  deleteRole(data: { organizationId: string; roleId: string }) {
    return this.send(pattern(deleteSpaceRole), data satisfies RpcRequest<typeof deleteSpaceRole>);
  }

  // Members
  listMembers(data: { organizationId: string; spaceId: string }) {
    return this.send(pattern(listSpaceMembers), data satisfies RpcRequest<typeof listSpaceMembers>);
  }
  assignMember(data: {
    organizationId: string;
    spaceId: string;
    userId: string;
    spaceRoleId?: string | null;
    createdById?: string;
    /** Ceiling for what the caller may hand out. Null = admin, no ceiling. */
    requesterPerms?: PermissionSet | null;
    authority?: SpaceMemberAuthority;
    outrankCheck?: boolean;
  }) {
    return this.send(pattern(assignSpaceMember), data satisfies RpcRequest<typeof assignSpaceMember>);
  }
  removeMember(data: {
    organizationId: string;
    spaceId: string;
    memberId: string;
    outrankPerms?: PermissionSet | null;
  }) {
    return this.send(pattern(removeSpaceMember), data satisfies RpcRequest<typeof removeSpaceMember>);
  }

  /** One person's permissions here, as the builder shows them. */
  getMemberPermissions(data: {
    organizationId: string;
    spaceId: string;
    assignmentId: string;
    requesterPerms: PermissionSet | null;
  }) {
    return this.send(pattern(getSpaceMemberPermissions), data satisfies RpcRequest<typeof getSpaceMemberPermissions>);
  }

  /** Save one person's permissions here: a shared role, or a set of keys (their personal role). */
  setMemberPermissions(data: {
    organizationId: string;
    spaceId: string;
    assignmentId: string;
    choice: { roleId: string } | { permissions: PermissionSet };
    requesterPerms: PermissionSet | null;
    requesterId: string;
    outrankCheck: boolean;
  }) {
    return this.send(pattern(setSpaceMemberPermissions), data satisfies RpcRequest<typeof setSpaceMemberPermissions>);
  }
  updateMemberRouting(data: {
    organizationId: string;
    spaceId: string;
    memberId: string;
    notifyRoleIds?: string[];
    notifyUserIds?: string[];
    contactRoleIds?: string[];
    contactUserIds?: string[];
    approveRoleIds?: string[];
    approveUserIds?: string[];
  }) {
    return this.send(pattern(updateSpaceMemberRouting), data satisfies RpcRequest<typeof updateSpaceMemberRouting>);
  }

  /** What this member is billed at for THIS client — the top rung of the ladder. */
  updateMemberRate(data: {
    organizationId: string;
    spaceId: string;
    memberId: string;
    billRateCents?: number | null;
    costRateCents?: number | null;
    costDayCents?: number | null;
    effectiveFrom?: string;
    createdById?: string;
  }) {
    return this.send(pattern(updateSpaceMemberRate), data satisfies RpcRequest<typeof updateSpaceMemberRate>);
  }

  listSpaceRoles(data: { organizationId: string; spaceId: string }) {
    return this.send(pattern(listSpaceRolesInSpace), data satisfies RpcRequest<typeof listSpaceRolesInSpace>);
  }

  setRoleDayRate(data: {
    organizationId: string;
    /** Null = the role's default for every workspace. */
    spaceId: string | null;
    roleId: string;
    cents: number | null;
    effectiveFrom?: string;
    createdById?: string;
  }) {
    return this.send(pattern(setSpaceRoleDayRate), data satisfies RpcRequest<typeof setSpaceRoleDayRate>);
  }

  listRateHistory(data: {
    organizationId: string;
    target: 'ORGANIZATION' | 'SPACE' | 'MEMBER' | 'ASSIGNMENT';
    targetId: string;
    spaceId?: string;
    kinds: Array<'BILL_HOUR' | 'COST_HOUR' | 'COST_DAY'>;
  }) {
    return this.send(pattern(listRateHistory), data satisfies RpcRequest<typeof listRateHistory>);
  }

  updateMemberRoles(data: {
    organizationId: string;
    spaceId: string;
    memberId: string;
    workRoleId?: string | null;
    managementRoleId?: string | null;
    allowSecondRole?: boolean;
    billBy?: BillByValue | null;
    hoursBasis?: 'COUNTED' | 'CLOCKED' | 'SHIFT' | null;
    requesterPerms?: PermissionSet | null;
    authority?: SpaceMemberAuthority;
    outrankCheck?: boolean;
  }) {
    return this.send(pattern(updateSpaceMemberRoles), data satisfies RpcRequest<typeof updateSpaceMemberRoles>);
  }
}

import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService, type PermissionSet } from '@hbcfield/shared';

@Injectable()
export class SpaceRolesService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, SpaceRolesService.name);
  }

  // Roles
  listRoles(data: { organizationId: string }) {
    return this.send({ cmd: 'list_space_roles' }, data);
  }
  createRole(data: {
    organizationId: string;
    name: string;
    description?: string;
    color?: string;
    permissions?: PermissionSet;
  }) {
    return this.send({ cmd: 'create_space_role' }, data);
  }
  updateRole(data: {
    organizationId: string;
    roleId: string;
    name?: string;
    description?: string;
    color?: string;
    permissions?: PermissionSet;
    isActive?: boolean;
    /** Ceiling for what the caller may author. Null = admin, no ceiling. */
    requesterPerms?: PermissionSet | null;
  }) {
    return this.send({ cmd: 'update_space_role' }, data);
  }
  deleteRole(data: { organizationId: string; roleId: string }) {
    return this.send({ cmd: 'delete_space_role' }, data);
  }

  // Members
  listMembers(data: { organizationId: string; spaceId: string }) {
    return this.send({ cmd: 'list_space_members' }, data);
  }
  assignMember(data: {
    organizationId: string;
    spaceId: string;
    userId: string;
    spaceRoleId?: string | null;
    createdById?: string;
    /** Ceiling for what the caller may hand out. Null = admin, no ceiling. */
    requesterPerms?: PermissionSet | null;
  }) {
    return this.send({ cmd: 'assign_space_member' }, data);
  }
  removeMember(data: { organizationId: string; spaceId: string; memberId: string }) {
    return this.send({ cmd: 'remove_space_member' }, data);
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
    return this.send({ cmd: 'update_space_member_routing' }, data);
  }
}

import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SpaceRolesService } from './space-roles.service';
import type { PermissionSet } from '@hbcfield/shared';

@Controller()
export class SpaceRolesController {
  constructor(private readonly service: SpaceRolesService) {}

  // ── Roles ──
  @MessagePattern({ cmd: 'list_space_roles' })
  listRoles(@Payload() data: { organizationId: string }) {
    return this.service.listRoles(data);
  }

  @MessagePattern({ cmd: 'create_space_role' })
  createRole(
    @Payload()
    data: {
      organizationId: string;
      name: string;
      description?: string;
      color?: string;
      permissions?: PermissionSet;
    },
  ) {
    return this.service.createRole(data);
  }

  @MessagePattern({ cmd: 'update_space_role' })
  updateRole(
    @Payload()
    data: {
      organizationId: string;
      roleId: string;
      name?: string;
      description?: string;
      color?: string;
      permissions?: PermissionSet;
      isActive?: boolean;
    },
  ) {
    return this.service.updateRole(data);
  }

  @MessagePattern({ cmd: 'delete_space_role' })
  deleteRole(@Payload() data: { organizationId: string; roleId: string }) {
    return this.service.deleteRole(data);
  }

  // ── Members ──
  @MessagePattern({ cmd: 'list_space_members' })
  listMembers(@Payload() data: { organizationId: string; spaceId: string }) {
    return this.service.listMembers(data);
  }

  @MessagePattern({ cmd: 'assign_space_member' })
  assignMember(
    @Payload()
    data: {
      organizationId: string;
      spaceId: string;
      userId: string;
      spaceRoleId?: string | null;
      createdById?: string;
    },
  ) {
    return this.service.assignMember(data);
  }

  @MessagePattern({ cmd: 'remove_space_member' })
  removeMember(@Payload() data: { organizationId: string; spaceId: string; memberId: string }) {
    return this.service.removeMember(data);
  }

  @MessagePattern({ cmd: 'update_space_member_routing' })
  updateMemberRouting(
    @Payload()
    data: {
      organizationId: string;
      spaceId: string;
      memberId: string;
      notifyRoleIds?: string[];
      notifyUserIds?: string[];
      contactRoleIds?: string[];
      contactUserIds?: string[];
      approveRoleIds?: string[];
      approveUserIds?: string[];
    },
  ) {
    return this.service.updateMemberRouting(data);
  }
}

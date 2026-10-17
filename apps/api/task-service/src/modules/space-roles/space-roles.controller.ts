import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SpaceRolesService, type SpaceMemberAuthority } from './space-roles.service';
import type { PermissionSet } from '@hbcfield/shared';
import { RoleAdminService } from './role-admin.service';
import { SpaceMembersService } from './space-members.service';
import { MemberRolesService } from './member-roles.service';
import { MemberTermsService } from './member-terms.service';

@Controller()
export class SpaceRolesController {
  constructor(
    private readonly service: SpaceRolesService,
    private readonly memberTerms: MemberTermsService,
    private readonly memberRoles: MemberRolesService,
    private readonly spaceMembers: SpaceMembersService,
    private readonly roleAdmin: RoleAdminService,
  ) {}

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
      kind?: any;
      spaceId?: string;
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
      kind?: any;
      requesterPerms?: PermissionSet | null;
    },
  ) {
    return this.service.updateRole(data);
  }

  @MessagePattern({ cmd: 'set_work_role_here' })
  setWorkRoleHere(@Payload() data: { organizationId: string; spaceId: string; roleId: string; active: boolean }) {
    return this.roleAdmin.setWorkRoleHere(data);
  }

  @MessagePattern({ cmd: 'merge_space_role' })
  mergeRole(@Payload() data: { organizationId: string; roleId: string; intoRoleId: string }) {
    return this.roleAdmin.mergeRole(data);
  }

  @MessagePattern({ cmd: 'delete_space_role' })
  deleteRole(@Payload() data: { organizationId: string; roleId: string }) {
    return this.roleAdmin.deleteRole(data);
  }

  // ── Members ──
  @MessagePattern({ cmd: 'list_space_members' })
  listMembers(@Payload() data: { organizationId: string; spaceId: string }) {
    return this.spaceMembers.listMembers(data);
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
      requesterPerms?: PermissionSet | null;
      authority?: SpaceMemberAuthority;
      outrankCheck?: boolean;
    },
  ) {
    return this.spaceMembers.assignMember(data);
  }

  @MessagePattern({ cmd: 'remove_space_member' })
  removeMember(
    @Payload() data: { organizationId: string; spaceId: string; memberId: string; outrankPerms?: PermissionSet | null },
  ) {
    return this.memberRoles.removeMember(data);
  }

  // ── One person's permissions here (the builder) ──
  @MessagePattern({ cmd: 'get_space_member_permissions' })
  getMemberPermissions(
    @Payload()
    data: {
      organizationId: string;
      spaceId: string;
      assignmentId: string;
      requesterPerms?: PermissionSet | null;
    },
  ) {
    return this.memberRoles.getMemberPermissions(data);
  }

  @MessagePattern({ cmd: 'set_space_member_permissions' })
  setMemberPermissions(@Payload() data: any) {
    return this.memberRoles.setMemberPermissions(data);
  }

  @MessagePattern({ cmd: 'list_space_roles_in_space' })
  listSpaceRoles(@Payload() data: { organizationId: string; spaceId: string }) {
    return this.service.listSpaceRoles(data);
  }

  @MessagePattern({ cmd: 'set_space_role_day_rate' })
  setRoleDayRate(@Payload() data: any) {
    return this.roleAdmin.setRoleDayRate(data);
  }

  @MessagePattern({ cmd: 'list_rate_history' })
  listRateHistory(@Payload() data: any) {
    return this.memberTerms.listRateHistory(data);
  }

  @MessagePattern({ cmd: 'update_space_member_roles' })
  updateMemberRoles(@Payload() data: any) {
    return this.memberRoles.updateMemberRoles(data);
  }

  @MessagePattern({ cmd: 'update_space_member_rate' })
  updateMemberRate(@Payload() data: any) {
    return this.memberTerms.updateMemberRate(data);
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
    return this.memberTerms.updateMemberRouting(data);
  }
}

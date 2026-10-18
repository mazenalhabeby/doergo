import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
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
import { SpaceRolesService } from './space-roles.service';
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
  @MessagePattern(pattern(listSpaceRoles))
  listRoles(@Payload() data: RpcRequest<typeof listSpaceRoles>) {
    return this.service.listRoles(data);
  }

  @MessagePattern(pattern(createSpaceRole))
  createRole(
    @Payload()
    data: RpcRequest<typeof createSpaceRole>,
  ) {
    return this.service.createRole(data);
  }

  @MessagePattern(pattern(updateSpaceRole))
  updateRole(
    @Payload()
    data: RpcRequest<typeof updateSpaceRole>,
  ) {
    return this.service.updateRole(data);
  }

  @MessagePattern(pattern(setWorkRoleHere))
  setWorkRoleHere(@Payload() data: RpcRequest<typeof setWorkRoleHere>) {
    return this.roleAdmin.setWorkRoleHere(data);
  }

  @MessagePattern(pattern(mergeSpaceRole))
  mergeRole(@Payload() data: RpcRequest<typeof mergeSpaceRole>) {
    return this.roleAdmin.mergeRole(data);
  }

  @MessagePattern(pattern(deleteSpaceRole))
  deleteRole(@Payload() data: RpcRequest<typeof deleteSpaceRole>) {
    return this.roleAdmin.deleteRole(data);
  }

  // ── Members ──
  @MessagePattern(pattern(listSpaceMembers))
  listMembers(@Payload() data: RpcRequest<typeof listSpaceMembers>) {
    return this.spaceMembers.listMembers(data);
  }

  @MessagePattern(pattern(assignSpaceMember))
  assignMember(
    @Payload()
    data: RpcRequest<typeof assignSpaceMember>,
  ) {
    return this.spaceMembers.assignMember(data);
  }

  @MessagePattern(pattern(removeSpaceMember))
  removeMember(@Payload() data: RpcRequest<typeof removeSpaceMember>) {
    return this.memberRoles.removeMember(data);
  }

  // ── One person's permissions here (the builder) ──
  @MessagePattern(pattern(getSpaceMemberPermissions))
  getMemberPermissions(
    @Payload()
    data: RpcRequest<typeof getSpaceMemberPermissions>,
  ) {
    return this.memberRoles.getMemberPermissions(data);
  }

  @MessagePattern(pattern(setSpaceMemberPermissions))
  setMemberPermissions(@Payload() data: RpcRequest<typeof setSpaceMemberPermissions>) {
    return this.memberRoles.setMemberPermissions(data);
  }

  @MessagePattern(pattern(listSpaceRolesInSpace))
  listSpaceRoles(@Payload() data: RpcRequest<typeof listSpaceRolesInSpace>) {
    return this.service.listSpaceRoles(data);
  }

  @MessagePattern(pattern(setSpaceRoleDayRate))
  setRoleDayRate(@Payload() data: RpcRequest<typeof setSpaceRoleDayRate>) {
    return this.roleAdmin.setRoleDayRate(data);
  }

  @MessagePattern(pattern(listRateHistory))
  listRateHistory(@Payload() data: RpcRequest<typeof listRateHistory>) {
    return this.memberTerms.listRateHistory(data);
  }

  @MessagePattern(pattern(updateSpaceMemberRoles))
  updateMemberRoles(@Payload() data: RpcRequest<typeof updateSpaceMemberRoles>) {
    return this.memberRoles.updateMemberRoles(data);
  }

  @MessagePattern(pattern(updateSpaceMemberRate))
  updateMemberRate(@Payload() data: RpcRequest<typeof updateSpaceMemberRate>) {
    return this.memberTerms.updateMemberRate(data);
  }

  @MessagePattern(pattern(updateSpaceMemberRouting))
  updateMemberRouting(
    @Payload()
    data: RpcRequest<typeof updateSpaceMemberRouting>,
  ) {
    return this.memberTerms.updateMemberRouting(data);
  }
}

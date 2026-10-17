import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { eventPattern, type EventPayload, appVersionSeenEvent } from '@hbcfield/shared/microservices';
import { UsersService } from './users.service';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  ListEmployeesDto,
  GetEmployeeDetailDto,
  ListOrgMembersDto,
  UpdateMemberProfileDto,
} from './dto';

import {
  pattern,
  findUser,
  getProfile,
  getWorkers,
  getWorkerTasks,
  listTechnicians,
  getTechnicianDetail,
  createTechnician,
  updateTechnician,
  deactivateTechnician,
  listOrgMembers,
  getOrgMember,
  listOrgContacts,
  getMemberWatchers,
  setMemberWatchers,
  listNotifications,
  markNotificationsRead,
  getMyNotificationPrefs,
  updateMyNotificationPrefs,
  updateMemberProfile,
  listAccessRoles,
  createAccessRole,
  updateAccessRole,
  transferOwnership,
  deleteAccessRole,
  updateOwnProfile,
  updateOwnEmail,
  adminResetMemberPassword,
  setMemberHome,
  removeMember,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ============================================================================
  // EXISTING METHODS
  // ============================================================================

  @MessagePattern(pattern(findUser))
  async findOne(@Payload() data: RpcRequest<typeof findUser>) {
    return this.usersService.findOne(data.id, data.organizationId);
  }

  @MessagePattern(pattern(getProfile))
  async getProfile(@Payload() data: RpcRequest<typeof getProfile>) {
    return this.usersService.findOne(data.userId);
  }

  @MessagePattern(pattern(getWorkers))
  async getWorkers(@Payload() data: RpcRequest<typeof getWorkers>) {
    return this.usersService.getWorkers(data.organizationId, data.canViewTracking === true);
  }

  @MessagePattern(pattern(getWorkerTasks))
  async getWorkerTasks(@Payload() data: RpcRequest<typeof getWorkerTasks>) {
    return this.usersService.getWorkerTasks(data.workerId, data.organizationId);
  }

  // ============================================================================
  // EMPLOYEE MANAGEMENT
  // ============================================================================

  @MessagePattern(pattern(listTechnicians))
  async listEmployees(@Payload() data: RpcRequest<typeof listTechnicians>) {
    return this.usersService.listEmployees(data);
  }

  @MessagePattern(pattern(getTechnicianDetail))
  async getEmployeeDetail(@Payload() data: RpcRequest<typeof getTechnicianDetail>) {
    return this.usersService.getEmployeeDetail(data);
  }

  @MessagePattern(pattern(createTechnician))
  async createEmployee(@Payload() data: RpcRequest<typeof createTechnician>) {
    return this.usersService.createEmployee(data);
  }

  @MessagePattern(pattern(updateTechnician))
  async updateEmployee(@Payload() data: RpcRequest<typeof updateTechnician>) {
    return this.usersService.updateEmployee(data.id, data.organizationId, data.dto);
  }

  @MessagePattern(pattern(deactivateTechnician))
  async deactivateEmployee(@Payload() data: RpcRequest<typeof deactivateTechnician>) {
    return this.usersService.deactivateEmployee(data.id, data.organizationId);
  }

  /*
    ⚠️ `get_technician_performance` is answered by TASK-SERVICE only.

    It used to be registered here as well. Every service listens on the same
    Redis bus, so both answered and the first reply won — and this copy ignored
    `scopeSpaceIds`, so a supervisor whose authority is one workspace was
    sometimes handed the whole organization's figures. One handler, one rule.
  */

  // ============================================================================
  // ORGANIZATION MEMBERS
  // ============================================================================

  @MessagePattern(pattern(listOrgMembers))
  async listOrgMembers(@Payload() data: RpcRequest<typeof listOrgMembers>) {
    return this.usersService.listOrgMembers(data);
  }

  @MessagePattern(pattern(getOrgMember))
  async getOrgMember(@Payload() data: RpcRequest<typeof getOrgMember>) {
    return this.usersService.getOrgMemberById(data.memberId, data.organizationId);
  }

  @MessagePattern(pattern(listOrgContacts))
  async listOrgContacts(@Payload() data: RpcRequest<typeof listOrgContacts>) {
    return this.usersService.listOrgContacts(data.organizationId, data.userId);
  }

  // update_member_role removed — it was never wired to a gateway route and lacked
  // the memberRoleId ceiling guard that update_member_profile has. Member role
  // changes go through update_member_profile (the single guarded path).

  @MessagePattern(pattern(getMemberWatchers))
  async getMemberWatchers(@Payload() data: RpcRequest<typeof getMemberWatchers>) {
    return this.usersService.getWatchers(data.memberId, data.organizationId);
  }

  @MessagePattern(pattern(setMemberWatchers))
  async setMemberWatchers(@Payload() data: RpcRequest<typeof setMemberWatchers>) {
    return this.usersService.setWatchers(data.memberId, data.organizationId, data.watcherIds || []);
  }

  @MessagePattern(pattern(listNotifications))
  async listNotifications(@Payload() data: RpcRequest<typeof listNotifications>) {
    return this.usersService.listNotifications(data.userId, data.limit);
  }

  @MessagePattern(pattern(markNotificationsRead))
  async markNotificationsRead(@Payload() data: RpcRequest<typeof markNotificationsRead>) {
    return this.usersService.markNotificationsRead(data.userId, data.ids);
  }

  /*
    ⚠️ `_my_` in the name is load-bearing. Both this and the organization's
    settings used to answer `update_notification_prefs`, and Nest keeps only the
    LAST handler registered for a pattern: OnboardingModule loads after
    UsersModule, so a member saving their own switches reached the
    organization's update with no organization id, and it failed. Every pattern
    in a service must be unique — the member's and the organization's are two
    different things with two different names.
  */
  @MessagePattern(pattern(getMyNotificationPrefs))
  async getNotificationPrefs(@Payload() data: RpcRequest<typeof getMyNotificationPrefs>) {
    return this.usersService.getNotificationPrefs(data.userId);
  }

  @MessagePattern(pattern(updateMyNotificationPrefs))
  async updateNotificationPrefs(@Payload() data: RpcRequest<typeof updateMyNotificationPrefs>) {
    return this.usersService.updateNotificationPrefs(data.userId, data.prefs || {});
  }

  @MessagePattern(pattern(updateMemberProfile))
  async updateMemberProfile(@Payload() data: RpcRequest<typeof updateMemberProfile>) {
    return this.usersService.updateMemberProfile(data.memberId, data.organizationId, data.requesterId, data.dto);
  }

  @MessagePattern(pattern(listAccessRoles))
  async listAccessRoles(@Payload() data: RpcRequest<typeof listAccessRoles>) {
    return this.usersService.listAccessRoles(data);
  }

  @MessagePattern(pattern(createAccessRole))
  async createAccessRole(@Payload() data: RpcRequest<typeof createAccessRole>) {
    return this.usersService.createAccessRole(data);
  }

  @MessagePattern(pattern(updateAccessRole))
  async updateAccessRole(@Payload() data: RpcRequest<typeof updateAccessRole>) {
    return this.usersService.updateAccessRole(data);
  }

  @MessagePattern(pattern(transferOwnership))
  transferOwnership(@Payload() data: RpcRequest<typeof transferOwnership>) {
    return this.usersService.transferOwnership(data);
  }

  @MessagePattern(pattern(deleteAccessRole))
  async deleteAccessRole(@Payload() data: RpcRequest<typeof deleteAccessRole>) {
    return this.usersService.deleteAccessRole(data);
  }

  @MessagePattern(pattern(updateOwnProfile))
  async updateOwnProfile(@Payload() data: RpcRequest<typeof updateOwnProfile>) {
    return this.usersService.updateOwnProfile(data.userId, data.dto);
  }

  @MessagePattern(pattern(updateOwnEmail))
  async updateOwnEmail(@Payload() data: RpcRequest<typeof updateOwnEmail>) {
    return this.usersService.updateOwnEmail(data.userId, {
      newEmail: data.newEmail,
      currentPassword: data.currentPassword,
    });
  }

  @MessagePattern(pattern(adminResetMemberPassword))
  async adminResetMemberPassword(@Payload() data: RpcRequest<typeof adminResetMemberPassword>) {
    return this.usersService.adminResetMemberPassword(data.memberId, data.organizationId, data.requesterId);
  }

  /**
   * Record which build of the app a member is running.
   *
   * An EVENT, not a message: the gateway emits and moves on. Nothing about a
   * request should wait on bookkeeping, and losing one is harmless — the next
   * request from that phone records the same thing.
   */
  @EventPattern(eventPattern(appVersionSeenEvent))
  async appVersionSeen(@Payload() data: EventPayload<typeof appVersionSeenEvent>) {
    return this.usersService.recordAppVersion(data);
  }

  @MessagePattern(pattern(setMemberHome))
  async setMemberHome(@Payload() data: RpcRequest<typeof setMemberHome>) {
    return this.usersService.setAssignedHome(data);
  }

  @MessagePattern(pattern(removeMember))
  async removeMember(@Payload() data: RpcRequest<typeof removeMember>) {
    return this.usersService.removeMember(data);
  }
}

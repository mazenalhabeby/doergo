import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { UsersService } from './users.service';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  ListEmployeesDto,
  GetEmployeeDetailDto,
  GetEmployeePerformanceDto,
  ListOrgMembersDto,
  UpdateMemberProfileDto,
} from './dto';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ============================================================================
  // EXISTING METHODS
  // ============================================================================

  @MessagePattern({ cmd: 'find_user' })
  async findOne(@Payload() data: { id: string; organizationId?: string }) {
    return this.usersService.findOne(data.id, data.organizationId);
  }

  @MessagePattern({ cmd: 'get_profile' })
  async getProfile(@Payload() data: { userId: string }) {
    return this.usersService.findOne(data.userId);
  }

  @MessagePattern({ cmd: 'get_workers' })
  async getWorkers(@Payload() data: { organizationId?: string }) {
    return this.usersService.getWorkers(data.organizationId);
  }

  @MessagePattern({ cmd: 'get_worker_tasks' })
  async getWorkerTasks(@Payload() data: { workerId: string; organizationId?: string }) {
    return this.usersService.getWorkerTasks(data.workerId, data.organizationId);
  }

  // ============================================================================
  // EMPLOYEE MANAGEMENT
  // ============================================================================

  @MessagePattern({ cmd: 'list_technicians' })
  async listEmployees(@Payload() data: ListEmployeesDto) {
    return this.usersService.listEmployees(data);
  }

  @MessagePattern({ cmd: 'get_technician_detail' })
  async getEmployeeDetail(@Payload() data: GetEmployeeDetailDto) {
    return this.usersService.getEmployeeDetail(data);
  }

  @MessagePattern({ cmd: 'create_technician' })
  async createEmployee(@Payload() data: CreateEmployeeDto) {
    return this.usersService.createEmployee(data);
  }

  @MessagePattern({ cmd: 'update_technician' })
  async updateEmployee(
    @Payload() data: { id: string; organizationId: string; dto: UpdateEmployeeDto },
  ) {
    return this.usersService.updateEmployee(data.id, data.organizationId, data.dto);
  }

  @MessagePattern({ cmd: 'deactivate_technician' })
  async deactivateEmployee(
    @Payload() data: { id: string; organizationId: string },
  ) {
    return this.usersService.deactivateEmployee(data.id, data.organizationId);
  }

  @MessagePattern({ cmd: 'get_technician_performance' })
  async getEmployeePerformance(@Payload() data: GetEmployeePerformanceDto) {
    return this.usersService.getEmployeePerformance(data);
  }

  // ============================================================================
  // ORGANIZATION MEMBERS
  // ============================================================================

  @MessagePattern({ cmd: 'list_org_members' })
  async listOrgMembers(@Payload() data: ListOrgMembersDto) {
    return this.usersService.listOrgMembers(data);
  }

  @MessagePattern({ cmd: 'get_org_member' })
  async getOrgMember(@Payload() data: { memberId: string; organizationId: string }) {
    return this.usersService.getOrgMemberById(data.memberId, data.organizationId);
  }

  @MessagePattern({ cmd: 'list_org_contacts' })
  async listOrgContacts(@Payload() data: { organizationId: string; userId: string }) {
    return this.usersService.listOrgContacts(data.organizationId, data.userId);
  }

  // update_member_role removed — it was never wired to a gateway route and lacked
  // the memberRoleId ceiling guard that update_member_profile has. Member role
  // changes go through update_member_profile (the single guarded path).

  @MessagePattern({ cmd: 'get_member_watchers' })
  async getMemberWatchers(@Payload() data: { memberId: string; organizationId: string }) {
    return this.usersService.getWatchers(data.memberId, data.organizationId);
  }

  @MessagePattern({ cmd: 'set_member_watchers' })
  async setMemberWatchers(
    @Payload() data: { memberId: string; organizationId: string; watcherIds: string[] },
  ) {
    return this.usersService.setWatchers(data.memberId, data.organizationId, data.watcherIds || []);
  }

  @MessagePattern({ cmd: 'list_notifications' })
  async listNotifications(@Payload() data: { userId: string; limit?: number }) {
    return this.usersService.listNotifications(data.userId, data.limit);
  }

  @MessagePattern({ cmd: 'mark_notifications_read' })
  async markNotificationsRead(@Payload() data: { userId: string; ids?: string[] }) {
    return this.usersService.markNotificationsRead(data.userId, data.ids);
  }

  @MessagePattern({ cmd: 'get_notification_prefs' })
  async getNotificationPrefs(@Payload() data: { userId: string }) {
    return this.usersService.getNotificationPrefs(data.userId);
  }

  @MessagePattern({ cmd: 'update_notification_prefs' })
  async updateNotificationPrefs(
    @Payload() data: { userId: string; prefs: Record<string, boolean> },
  ) {
    return this.usersService.updateNotificationPrefs(data.userId, data.prefs || {});
  }

  @MessagePattern({ cmd: 'update_member_profile' })
  async updateMemberProfile(
    @Payload()
    data: {
      memberId: string;
      organizationId: string;
      requesterId: string;
      dto: UpdateMemberProfileDto;
    },
  ) {
    return this.usersService.updateMemberProfile(
      data.memberId,
      data.organizationId,
      data.requesterId,
      data.dto,
    );
  }

  @MessagePattern({ cmd: 'list_access_roles' })
  async listAccessRoles(@Payload() data: { organizationId: string; scope?: 'org' | 'space' }) {
    return this.usersService.listAccessRoles(data);
  }

  @MessagePattern({ cmd: 'create_access_role' })
  async createAccessRole(
    @Payload() data: { organizationId: string; requesterId?: string; name: string; description?: string; color?: string; permissions?: unknown },
  ) {
    return this.usersService.createAccessRole(data);
  }

  @MessagePattern({ cmd: 'update_access_role' })
  async updateAccessRole(
    @Payload() data: { organizationId: string; requesterId?: string; roleId: string; name?: string; description?: string; color?: string; permissions?: unknown },
  ) {
    return this.usersService.updateAccessRole(data);
  }

  @MessagePattern({ cmd: 'transfer_ownership' })
  transferOwnership(@Payload() data: any) { return this.usersService.transferOwnership(data); }

  @MessagePattern({ cmd: 'delete_access_role' })
  async deleteAccessRole(@Payload() data: { organizationId: string; requesterId?: string; roleId: string }) {
    return this.usersService.deleteAccessRole(data);
  }

  @MessagePattern({ cmd: 'update_own_profile' })
  async updateOwnProfile(
    @Payload() data: { userId: string; dto: { firstName?: string; lastName?: string; presence?: string | null; timeFormat?: string } },
  ) {
    return this.usersService.updateOwnProfile(data.userId, data.dto);
  }

  @MessagePattern({ cmd: 'update_own_email' })
  async updateOwnEmail(
    @Payload() data: { userId: string; newEmail: string; currentPassword: string },
  ) {
    return this.usersService.updateOwnEmail(data.userId, {
      newEmail: data.newEmail,
      currentPassword: data.currentPassword,
    });
  }

  @MessagePattern({ cmd: 'admin_reset_member_password' })
  async adminResetMemberPassword(
    @Payload()
    data: {
      memberId: string;
      organizationId: string;
      requesterId: string;
    },
  ) {
    return this.usersService.adminResetMemberPassword(
      data.memberId,
      data.organizationId,
      data.requesterId,
    );
  }

  /**
   * Record which build of the app a member is running.
   *
   * An EVENT, not a message: the gateway emits and moves on. Nothing about a
   * request should wait on bookkeeping, and losing one is harmless — the next
   * request from that phone records the same thing.
   */
  @EventPattern('app_version_seen')
  async appVersionSeen(@Payload() data: { userId: string; version: string; platform?: string }) {
    return this.usersService.recordAppVersion(data);
  }

  @MessagePattern({ cmd: 'remove_member' })
  async removeMember(
    @Payload()
    data: {
      memberId: string;
      organizationId: string;
      requesterId: string;
    },
  ) {
    return this.usersService.removeMember(data);
  }
}

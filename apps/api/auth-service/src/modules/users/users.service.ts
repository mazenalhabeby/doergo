import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { AccessRolesService } from './access-roles.service';
import { MemberDirectoryService } from './member-directory.service';
import { EmployeesService } from './employees.service';
import { EmployeeDetailService } from './employee-detail.service';
import { MemberAdminService } from './member-admin.service';
import { OwnAccountService } from './own-account.service';
import { MemberWatchersService } from './member-watchers.service';
import { MemberOwnershipService } from './member-ownership.service';
import { MemberProfileService } from './member-profile.service';
import { EmployeeWriteService } from './employee-write.service';
import { AccessRoleWriteService } from './access-role-write.service';
import { OrgMembersService } from './org-members.service';

/**
 * Members and their access — THE FACADE.
 *
 * The work lives in one collaborator per responsibility, beside this file:
 * the directory, employee records and the detail page, member administration
 * and its grant ceiling, access roles, a member's own account, and watchers.
 * This class keeps every method callers already use and hands each to the
 * part that owns it. The boot-time built-in role sync stays here so it runs
 * exactly once.
 */
@Injectable()
export class UsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly roles: AccessRolesService,
    private readonly roleWrites: AccessRoleWriteService,
    private readonly directory: MemberDirectoryService,
    private readonly orgMembers: OrgMembersService,
    private readonly employees: EmployeesService,
    private readonly employeeWrites: EmployeeWriteService,
    private readonly employeeDetail: EmployeeDetailService,
    private readonly admin: MemberAdminService,
    private readonly memberProfile: MemberProfileService,
    private readonly ownership: MemberOwnershipService,
    private readonly ownAccount: OwnAccountService,
    private readonly watchers: MemberWatchersService,
  ) {}

  /** Built-ins catch up with their definitions once per boot, across every organization. */
  async onApplicationBootstrap() {
    await this.roles.syncBuiltInRoles().catch((e) => this.logger.warn(`Built-in role sync skipped: ${e?.message ?? e}`));
  }

  syncBuiltInRoles(...args: Parameters<AccessRolesService['syncBuiltInRoles']>) {
    return this.roles.syncBuiltInRoles(...args);
  }

  findOne(...args: Parameters<MemberDirectoryService['findOne']>) {
    return this.directory.findOne(...args);
  }

  getWorkers(...args: Parameters<MemberDirectoryService['getWorkers']>) {
    return this.directory.getWorkers(...args);
  }

  getWorkerTasks(...args: Parameters<MemberDirectoryService['getWorkerTasks']>) {
    return this.directory.getWorkerTasks(...args);
  }

  listEmployees(...args: Parameters<EmployeesService['listEmployees']>) {
    return this.employees.listEmployees(...args);
  }

  getEmployeeDetail(...args: Parameters<EmployeeDetailService['getEmployeeDetail']>) {
    return this.employeeDetail.getEmployeeDetail(...args);
  }

  createEmployee(...args: Parameters<EmployeeWriteService['createEmployee']>) {
    return this.employeeWrites.createEmployee(...args);
  }

  updateEmployee(...args: Parameters<EmployeeWriteService['updateEmployee']>) {
    return this.employeeWrites.updateEmployee(...args);
  }

  deactivateEmployee(...args: Parameters<EmployeesService['deactivateEmployee']>) {
    return this.employees.deactivateEmployee(...args);
  }

  listOrgContacts(...args: Parameters<MemberDirectoryService['listOrgContacts']>) {
    return this.directory.listOrgContacts(...args);
  }

  listOrgMembers(...args: Parameters<OrgMembersService['listOrgMembers']>) {
    return this.orgMembers.listOrgMembers(...args);
  }

  getOrgMemberById(...args: Parameters<OrgMembersService['getOrgMemberById']>) {
    return this.orgMembers.getOrgMemberById(...args);
  }

  transferOwnership(...args: Parameters<MemberOwnershipService['transferOwnership']>) {
    return this.ownership.transferOwnership(...args);
  }

  setAssignedHome(...args: Parameters<MemberOwnershipService['setAssignedHome']>) {
    return this.ownership.setAssignedHome(...args);
  }

  removeMember(...args: Parameters<MemberAdminService['removeMember']>) {
    return this.admin.removeMember(...args);
  }

  updateMemberProfile(...args: Parameters<MemberProfileService['updateMemberProfile']>) {
    return this.memberProfile.updateMemberProfile(...args);
  }

  listAccessRoles(...args: Parameters<AccessRolesService['listAccessRoles']>) {
    return this.roles.listAccessRoles(...args);
  }

  createAccessRole(...args: Parameters<AccessRoleWriteService['createAccessRole']>) {
    return this.roleWrites.createAccessRole(...args);
  }

  updateAccessRole(...args: Parameters<AccessRoleWriteService['updateAccessRole']>) {
    return this.roleWrites.updateAccessRole(...args);
  }

  deleteAccessRole(...args: Parameters<AccessRoleWriteService['deleteAccessRole']>) {
    return this.roleWrites.deleteAccessRole(...args);
  }

  updateOwnProfile(...args: Parameters<OwnAccountService['updateOwnProfile']>) {
    return this.ownAccount.updateOwnProfile(...args);
  }

  updateOwnEmail(...args: Parameters<OwnAccountService['updateOwnEmail']>) {
    return this.ownAccount.updateOwnEmail(...args);
  }

  adminResetMemberPassword(...args: Parameters<MemberAdminService['adminResetMemberPassword']>) {
    return this.admin.adminResetMemberPassword(...args);
  }

  getWatchers(...args: Parameters<MemberWatchersService['getWatchers']>) {
    return this.watchers.getWatchers(...args);
  }

  setWatchers(...args: Parameters<MemberWatchersService['setWatchers']>) {
    return this.watchers.setWatchers(...args);
  }

  listNotifications(...args: Parameters<OwnAccountService['listNotifications']>) {
    return this.ownAccount.listNotifications(...args);
  }

  markNotificationsRead(...args: Parameters<OwnAccountService['markNotificationsRead']>) {
    return this.ownAccount.markNotificationsRead(...args);
  }

  getNotificationPrefs(...args: Parameters<OwnAccountService['getNotificationPrefs']>) {
    return this.ownAccount.getNotificationPrefs(...args);
  }

  updateNotificationPrefs(...args: Parameters<OwnAccountService['updateNotificationPrefs']>) {
    return this.ownAccount.updateNotificationPrefs(...args);
  }

  recordAppVersion(...args: Parameters<OwnAccountService['recordAppVersion']>) {
    return this.ownAccount.recordAppVersion(...args);
  }
}

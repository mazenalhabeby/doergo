import { UsersService } from './users.service';
import { MemberAccessChecksService } from './member-access-checks.service';
import { AccessRolesService } from './access-roles.service';
import { MemberDirectoryService } from './member-directory.service';
import { EmployeesService } from './employees.service';
import { EmployeeDetailService } from './employee-detail.service';
import { MemberAdminService } from './member-admin.service';
import { OwnAccountService } from './own-account.service';
import { MemberWatchersService } from './member-watchers.service';

/**
 * Member management as providers: the `UsersService` facade and the
 * collaborators it hands each responsibility to.
 *
 * One list, read by the module AND by every spec that builds the service, so a
 * collaborator added here can never be missing from one of them.
 */
export const USERS_SERVICES = [
  UsersService,
  MemberAccessChecksService,
  AccessRolesService,
  MemberDirectoryService,
  EmployeesService,
  EmployeeDetailService,
  MemberAdminService,
  OwnAccountService,
  MemberWatchersService,
];

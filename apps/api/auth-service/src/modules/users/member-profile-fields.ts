import { Role, filterExternalModules } from '@hbcfield/shared';
import type { UpdateMemberProfileDto } from './dto';

/** The pure parts of `MemberProfileService.updateMemberProfile`: which fields a PATCH writes. */

type Dto = UpdateMemberProfileDto & Record<string, any>;

/**
 * Self-mutation guard: a member can never change their OWN role, permissions,
 * or assigned role via this admin endpoint (their own profile edits go through
 * updateOwnProfile). memberRoleId is included — it points at a permission-bearing
 * role, so a self { memberRoleId: adminRoleId } would be an escalation.
 * enabledModules is included for the SAME reason (audit M-B1): the Access
 * Profile's `spaceScope` is a server-enforced READ control — 'all' returns every
 * space in the org (task-service locations.service) — and `platforms`
 * decide what the member can reach. Leaving it out let a non-admin holding
 * canManageUsers PATCH their own id with { enabledModules: { spaceScope: 'all' } }
 * and widen their own visibility.
 */
export function touchesPrivilege(dto: Dto): boolean {
  return (
    dto.role !== undefined ||
    dto.canManageUsers !== undefined ||
    dto.canCreateTasks !== undefined ||
    dto.canViewAllTasks !== undefined ||
    dto.canAssignTasks !== undefined ||
    dto.taskCreationScope !== undefined ||
    dto.canViewReports !== undefined ||
    dto.memberRoleId !== undefined ||
    dto.enabledModules !== undefined
  );
}

/** Name and job title — written as sent. */
export function nameFields(dto: Dto, data: Record<string, any>): void {
  if (dto.firstName !== undefined) data.firstName = dto.firstName;
  if (dto.lastName !== undefined) data.lastName = dto.lastName;
  if (dto.position !== undefined) data.position = dto.position;
}

/** Birthday and planned hours. */
export function scheduleFields(dto: Dto, data: Record<string, any>): void {
  /*
    A birthday is a DAY, and only a day.

    Parsed at NOON UTC rather than midnight. The column is `@db.Date`, but the
    value travels as an instant on the way in: "1990-03-01T00:00:00Z" lands on
    the 28th of February for anyone west of Greenwich, which is how a person's
    birthday shifts by a day depending on where the server happens to be.
    Midday has no such edge in any real timezone.
  */
  if (dto.dateOfBirth !== undefined) {
    data.dateOfBirth = dto.dateOfBirth ? new Date(`${dto.dateOfBirth}T12:00:00Z`) : null;
  }
  if (dto.scheduleType !== undefined) data.scheduleType = dto.scheduleType;
  if (dto.monthlyHourBudget !== undefined) data.monthlyHourBudget = dto.monthlyHourBudget;
}

/**
 * An external member cannot hold `clock` or `time_off` — stripped from the
 * Access Profile being written (see the caller for why).
 */
export function modulesFor(modules: any, willBeExternal: boolean): unknown {
  return willBeExternal && modules && typeof modules === 'object' && !Array.isArray(modules)
    ? { ...modules, modules: filterExternalModules((modules as { modules?: unknown }).modules) }
    : willBeExternal
      ? filterExternalModules(modules)
      : modules;
}

/** Contact directory + access control. */
export function contactFields(dto: Dto, data: Record<string, any>): void {
  if (dto.contactable !== undefined) data.contactable = dto.contactable;
  if (dto.contactScope !== undefined) data.contactScope = dto.contactScope;
  if (dto.contactAllowedIds !== undefined) data.contactAllowedIds = dto.contactAllowedIds;
  if (dto.canViewReports !== undefined) data.canViewReports = dto.canViewReports;
  if (dto.allowRemote !== undefined) data.allowRemote = dto.allowRemote;
}

/** Does this PATCH clear the org-wide role (null or empty)? */
export function clearsMemberRole(dto: Dto): boolean {
  return dto.memberRoleId !== undefined && (dto.memberRoleId === null || dto.memberRoleId === '');
}

/** A role change writes the role and every flat permission, defaulted by the role. */
export function roleChangeFields(dto: Dto & { role: string }, data: Record<string, any>): void {
  data.role = dto.role;

  // Set default platform based on role if not provided
  data.canCreateTasks = dto.canCreateTasks ?? dto.role === Role.ADMIN;
  // Default taskCreationScope by role
  const defaultScope = dto.role === Role.ADMIN ? 'ORG' : 'SELF';
  data.taskCreationScope = dto.taskCreationScope ?? defaultScope;
  data.canViewAllTasks = dto.canViewAllTasks ?? dto.role === Role.ADMIN;
  data.canAssignTasks = dto.canAssignTasks ?? dto.role === Role.ADMIN;
  data.canManageUsers = dto.canManageUsers ?? dto.role === Role.ADMIN;
}

/** No role change — still allow updating individual permission/platform fields. */
export function flatPermissionFields(dto: Dto, data: Record<string, any>): void {
  if (dto.canCreateTasks !== undefined) data.canCreateTasks = dto.canCreateTasks;
  if (dto.taskCreationScope !== undefined) data.taskCreationScope = dto.taskCreationScope;
  if (dto.canViewAllTasks !== undefined) data.canViewAllTasks = dto.canViewAllTasks;
  if (dto.canAssignTasks !== undefined) data.canAssignTasks = dto.canAssignTasks;
  if (dto.canManageUsers !== undefined) data.canManageUsers = dto.canManageUsers;
}

/** What the update answers with. */
export const MEMBER_PROFILE_RESULT_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  position: true,
  scheduleType: true,
  monthlyHourBudget: true,
  canCreateTasks: true,
  taskCreationScope: true,
  canViewAllTasks: true,
  canAssignTasks: true,
  canManageUsers: true,
  memberRoleId: true,
} as const;

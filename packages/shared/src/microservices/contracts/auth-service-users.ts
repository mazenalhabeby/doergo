/** Message contracts for auth-service `users` handlers (types only — the wire is the cmd string). */
import { rpc } from '../contract';
import type { Role } from '../../types/enums';

import type { AuthServiceReply } from './auth-service-replies';

/**
 * DTO for listing employees
 */
export interface ListEmployeesDto {
  organizationId: string;
  /** undefined = org-wide; [] = granted nowhere and matches nothing (memberScopeFilter). */
  scopeSpaceIds?: string[];
  status?: 'active' | 'inactive' | 'all';
  position?: string;
  specialty?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'email' | 'rating' | 'taskCount' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * DTO for getting employee detail
 */
export interface GetEmployeeDetailDto {
  id: string;
  organizationId: string;
  /** null = an org-wide viewer; [space ids] = a member whose authority is per-space. */
  viewerSpaceIds?: string[] | null;
  /** Coordinates travel only to somebody who may see where people are (trackingVisibility). */
  canViewTracking?: boolean;
  /** Sent with canViewTracking (the same helper builds both); the detail does not read it. */
  trackingSpaceIds?: string[];
}

/**
 * DTO for creating a new employee
 */
export interface CreateEmployeeDto {
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
  position?: string;
  enabledModules?: string[];
  specialty?: string;
  maxDailyJobs?: number;
  organizationId: string;
}

/**
 * DTO for updating an employee
 */
export interface UpdateEmployeeDto {
  firstName?: string;
  lastName?: string;
  position?: string;
  /** "YYYY-MM-DD". A birthday has no time and no timezone. */
  dateOfBirth?: string | null;
  enabledModules?: string[];
  specialty?: string;
  employmentType?: string;
  maxDailyJobs?: number;
  isActive?: boolean;
  rating?: number;
  ratingCount?: number;
  canCreateTasks?: boolean;
  profileBadges?: unknown;
  /** Vacation entitlement; null = the organization's default (not 0). '' from a cleared form field means null. */
  leaveAllowance?: number | string | null;
  /** "YYYY-MM-DD", or null to clear. */
  employmentStartDate?: string | null;
  /** The member's own rates (dated writer); undefined leaves a rate alone, null clears it. */
  billRateCents?: unknown;
  costRateCents?: unknown;
  costDayCents?: unknown;
  rateEffectiveFrom?: string;
}

/**
 * DTO for listing organization members
 */
export interface ListOrgMembersDto {
  organizationId: string;
  search?: string;
  /** An account type (ADMIN/EMPLOYEE/CUSTOMER), an access-role id, or `none` — not only a Role. */
  role?: string;
  page?: number;
  limit?: number;
}

/**
 * DTO for updating a member's profile + role/permissions (combined)
 */
export interface UpdateMemberProfileDto {
  /** The company that employs them (a legal entity of this organization), or null to clear. */
  employerEntityId?: string | null;
  /** Login email — unique across all users. */
  email?: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  /** "YYYY-MM-DD", or null to clear. A birthday has no time and no timezone. */
  dateOfBirth?: string | null;
  scheduleType?: string;
  monthlyHourBudget?: number;
  role?: Role;
  canCreateTasks?: boolean;
  taskCreationScope?: string;
  canViewAllTasks?: boolean;
  canAssignTasks?: boolean;
  canManageUsers?: boolean;
  /* Read by the service (member-profile.service / member-profile-fields) but missing from this interface until the contract. */
  allowRemote?: boolean;
  canViewReports?: boolean;
  contactAllowedIds?: string[];
  contactScope?: string;
  contactable?: boolean;
  employmentStartDate?: string | null;
  enabledModules?: unknown;
  isExternal?: boolean;
  leaveAllowance?: number | null;
  memberRoleId?: string | null;
}

export const findUser = rpc<
  { id: string; organizationId?: string },
  AuthServiceReply<{ organizationId?: string | null }>
>('find_user');
export const getProfile = rpc<{ userId: string }>('get_profile');
export const getWorkers = rpc<{ organizationId?: string; canViewTracking?: boolean }>('get_workers');
export const getWorkerTasks = rpc<{ workerId: string; organizationId?: string }>('get_worker_tasks');
export const listTechnicians = rpc<ListEmployeesDto>('list_technicians');
export const getTechnicianDetail = rpc<GetEmployeeDetailDto>('get_technician_detail');
export const createTechnician = rpc<CreateEmployeeDto>('create_technician');
export const updateTechnician = rpc<{ id: string; organizationId: string; dto: UpdateEmployeeDto }>(
  'update_technician',
);
export const deactivateTechnician = rpc<{ id: string; organizationId: string }>('deactivate_technician');
export const listOrgMembers = rpc<
  ListOrgMembersDto & { managersOnly?: boolean; includeIds?: string[]; excludeId?: string; lite?: boolean }
>('list_org_members');
export const getOrgMember = rpc<{ memberId: string; organizationId: string }>('get_org_member');
export const listOrgContacts = rpc<{ organizationId: string; userId: string }>('list_org_contacts');
export const getMemberWatchers = rpc<{ memberId: string; organizationId: string }>('get_member_watchers');
export const setMemberWatchers = rpc<{ memberId: string; organizationId: string; watcherIds: string[] }>(
  'set_member_watchers',
);
export const getMyNotificationPrefs = rpc<{ userId: string }>('get_my_notification_prefs');
export const updateMyNotificationPrefs = rpc<{ userId: string; prefs: Record<string, boolean> }>(
  'update_my_notification_prefs',
);
export const updateMemberProfile = rpc<{
  memberId: string;
  organizationId: string;
  requesterId: string;
  dto: UpdateMemberProfileDto;
}>('update_member_profile');
export const listAccessRoles = rpc<{ organizationId: string; scope?: 'org' | 'space' }>('list_access_roles');
export const createAccessRole = rpc<{
  organizationId: string;
  requesterId?: string;
  name: string;
  description?: string;
  color?: string;
  permissions?: unknown;
}>('create_access_role');
export const updateAccessRole = rpc<{
  organizationId: string;
  requesterId?: string;
  roleId: string;
  name?: string;
  description?: string;
  color?: string;
  permissions?: unknown;
}>('update_access_role');
export const transferOwnership = rpc<{ organizationId: string; requesterId: string; newOwnerId: string }>(
  'transfer_ownership',
);
export const deleteAccessRole = rpc<{ organizationId: string; requesterId?: string; roleId: string }>(
  'delete_access_role',
);
export const updateOwnProfile = rpc<{
  userId: string;
  dto: {
    firstName?: string;
    lastName?: string;
    presence?: string | null;
    timeFormat?: string;
    guidesSeen?: boolean;
    locale?: string;
    clockInPick?: string;
    usesClock?: boolean;
  };
}>('update_own_profile');
export const updateOwnEmail = rpc<{ userId: string; newEmail: string; currentPassword: string }>('update_own_email');
export const adminResetMemberPassword = rpc<
  {
    memberId: string;
    organizationId: string;
    requesterId: string;
  },
  AuthServiceReply
>('admin_reset_member_password');
export const setMemberHome = rpc<{ memberId: string; organizationId: string; layout: unknown }>('set_member_home');
export const removeMember = rpc<{
  memberId: string;
  organizationId: string;
  requesterId: string;
}>('remove_member');

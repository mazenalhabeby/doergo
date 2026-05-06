/**
 * User/Technician DTOs for Auth Service
 */

import { WorkMode, Role } from '@hbcfield/shared';

/**
 * DTO for creating a new technician
 */
export interface CreateTechnicianDto {
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
  position?: string;
  enabledModules?: string[];
  workMode?: WorkMode;
  specialty?: string;
  maxDailyJobs?: number;
  organizationId: string;
}

/**
 * DTO for updating a technician
 */
export interface UpdateTechnicianDto {
  firstName?: string;
  lastName?: string;
  position?: string;
  enabledModules?: string[];
  workMode?: WorkMode;
  specialty?: string;
  maxDailyJobs?: number;
  isActive?: boolean;
  rating?: number;
  ratingCount?: number;
  canCreateTasks?: boolean;
  profileBadges?: any;
}

/**
 * DTO for listing technicians
 */
export interface ListTechniciansDto {
  organizationId: string;
  status?: 'active' | 'inactive' | 'all';
  workMode?: WorkMode | 'all';
  position?: string;
  specialty?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'email' | 'rating' | 'taskCount' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * DTO for getting technician detail
 */
export interface GetTechnicianDetailDto {
  id: string;
  organizationId: string;
}

/**
 * DTO for getting technician performance
 */
export interface GetTechnicianPerformanceDto {
  id: string;
  organizationId: string;
  startDate?: string;
  endDate?: string;
}

// ============================================================================
// ORGANIZATION MEMBERS DTOs
// ============================================================================

/**
 * DTO for listing organization members
 */
export interface ListOrgMembersDto {
  organizationId: string;
  search?: string;
  role?: Role;
  page?: number;
  limit?: number;
}

/**
 * DTO for updating a member's role/permissions
 */
export interface UpdateMemberRoleDto {
  role: Role;
  canCreateTasks?: boolean;
  canViewAllTasks?: boolean;
  canAssignTasks?: boolean;
  canManageUsers?: boolean;
}

/**
 * DTO for updating a member's profile + role/permissions (combined)
 */
export interface UpdateMemberProfileDto {
  firstName?: string;
  lastName?: string;
  role?: Role;
  canCreateTasks?: boolean;
  canViewAllTasks?: boolean;
  canAssignTasks?: boolean;
  canManageUsers?: boolean;
}

/**
 * DTO for removing a member
 */
export interface RemoveMemberDto {
  memberId: string;
  organizationId: string;
  requesterId: string;
}

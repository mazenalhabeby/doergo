import { Role } from "@hbcfield/shared";
/**
 * User/Employee DTOs for Auth Service
 */


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
  enabledModules?: string[];
  specialty?: string;
  employmentType?: string; // "IN_HOUSE" | "EXTERNAL"
  maxDailyJobs?: number;
  isActive?: boolean;
  rating?: number;
  ratingCount?: number;
  canCreateTasks?: boolean;
  profileBadges?: any;
}

/**
 * DTO for listing employees
 */
export interface ListEmployeesDto {
  organizationId: string;
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
}

/**
 * DTO for getting employee performance
 */
export interface GetEmployeePerformanceDto {
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
  taskCreationScope?: string;
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
  position?: string;
  scheduleType?: string;
  monthlyHourBudget?: number;
  role?: Role;
  canCreateTasks?: boolean;
  taskCreationScope?: string;
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

// Backward-compatible aliases for internal message patterns
export type CreateTechnicianDto = CreateEmployeeDto;
export type UpdateTechnicianDto = UpdateEmployeeDto;
export type ListTechniciansDto = ListEmployeesDto;
export type GetTechnicianDetailDto = GetEmployeeDetailDto;
export type GetTechnicianPerformanceDto = GetEmployeePerformanceDto;

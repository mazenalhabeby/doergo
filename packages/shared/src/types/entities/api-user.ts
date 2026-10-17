/** API envelopes, the base entity, the User shape, default permissions and profile badges. */
import { Role, TaskCreationScope } from '../enums';

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

// Pagination params
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Base entity interface
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// User interface
export interface User extends BaseEntity {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  organizationId: string | null;
  isActive: boolean;
  onboardingCompleted: boolean;
  // Permission fields
  canCreateTasks: boolean;
  taskCreationScope?: string;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  // Capabilities split out of the four flags above. Optional because they are
  // projections resolved server-side, and a token minted before the split
  // carries the old shape — the bridge in orgPermissionFields fills them in.
  canManageWorkspaces?: boolean;
  canManageRota?: boolean;
  canManageInvoices?: boolean;
  /** What labour COSTS, as opposed to what it bills at. See the ladder in billing/. */
  canViewLabourCost?: boolean;
  canManageAssets?: boolean;
  canViewReports?: boolean;
  // Technician-specific fields
}

// Default permissions by role
export const DEFAULT_PERMISSIONS: Record<Role, {
  canCreateTasks: boolean;
  taskCreationScope: TaskCreationScope;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
}> = {
  [Role.ADMIN]: {
    canCreateTasks: true,
    taskCreationScope: TaskCreationScope.ORG,
    canViewAllTasks: true,
    canAssignTasks: true,
    canManageUsers: true,
  },
  [Role.EMPLOYEE]: {
    canCreateTasks: false,
    taskCreationScope: TaskCreationScope.SELF,
    canViewAllTasks: false,
    canAssignTasks: false,
    canManageUsers: false,
  },
  // External customer: zero staff permissions. Request submission is authorized
  // by CustomerScopeGuard + dedicated portal endpoints, NOT by these flags.
  [Role.CUSTOMER]: {
    canCreateTasks: false,
    taskCreationScope: TaskCreationScope.NONE,
    canViewAllTasks: false,
    canAssignTasks: false,
    canManageUsers: false,
  },
};

// Profile badge visibility configuration
export interface ProfileBadgesConfig {
  showRole: boolean;
  showType: boolean;
  showSpecialty: boolean;
}

export const DEFAULT_PROFILE_BADGES: ProfileBadgesConfig = {
  showRole: true,
  showType: true,
  showSpecialty: true,
};

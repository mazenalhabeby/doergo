/**
 * Shared Guard Utilities
 *
 * Helper functions for role-based and permission-based authorization.
 * Note: RolesGuard and OnboardingCompleteGuard classes must be defined in each app
 * due to NestJS DI requirements. The shared package provides the implementation.
 */

export { OnboardingCompleteGuard } from './onboarding.guard';
export { PermissionsGuard } from './permissions.guard';

import { Role, normalizeRole } from '../types';

// ============================================
// Role-based helpers
// ============================================

/**
 * Helper to check if a user has a specific role (handles legacy values)
 */
export function hasRole(user: { role: string }, ...roles: Role[]): boolean {
  const normalized = normalizeRole(user.role);
  return roles.some((role) => normalized === role || normalized === normalizeRole(role));
}

/** Check if user is ADMIN */
export function isAdmin(user: { role: string }): boolean {
  const r = normalizeRole(user.role);
  return r === Role.ADMIN;
}

/** Check if user is MANAGER (formerly Dispatcher) */
export function isManager(_user: { role: string }): boolean {
  // The MANAGER role has been retired — "manager" is now the canViewAllTasks
  // access flag, not a role. Kept as a no-op alias for backward compatibility.
  return false;
}

/** Check if user is EMPLOYEE (formerly Technician) */
export function isEmployee(user: { role: string }): boolean {
  const r = normalizeRole(user.role);
  return r === Role.EMPLOYEE;
}

// ── Legacy aliases (backward compat) ──
/** @deprecated Use isAdmin() */
export function isClient(user: { role: string }): boolean { return isAdmin(user); }
/** @deprecated Use isManager() */
export function isDispatcher(user: { role: string }): boolean { return isManager(user); }
/** @deprecated Use isEmployee() */
export function isTechnician(user: { role: string }): boolean { return isEmployee(user); }
/** @deprecated Use isEmployee() */
export function isWorker(user: { role: string }): boolean { return isEmployee(user); }

// ============================================
// Permission-based helpers
// ============================================

interface UserWithPermissions {
  role: string;
  canCreateTasks?: boolean;
  taskCreationScope?: string;
  canViewAllTasks?: boolean;
  canAssignTasks?: boolean;
  canManageUsers?: boolean;
}

/**
 * Check if user can create tasks
 * Falls back to role-based check if permission not explicitly set
 */
export function canCreateTasks(user: UserWithPermissions): boolean {
  if (user.canCreateTasks !== undefined) return user.canCreateTasks;
  // Default: ADMIN can create tasks
  return isAdmin(user);
}

/**
 * Check if user can view all tasks (vs only their own)
 * Falls back to role-based check if permission not explicitly set
 */
export function canViewAllTasks(user: UserWithPermissions): boolean {
  if (user.canViewAllTasks !== undefined) return user.canViewAllTasks;
  // Default: ADMIN and MANAGER can view all tasks
  return isAdmin(user) || isManager(user);
}

/**
 * Check if user can assign tasks to workers
 * Falls back to role-based check if permission not explicitly set
 */
export function canAssignTasks(user: UserWithPermissions): boolean {
  if (user.canAssignTasks !== undefined) return user.canAssignTasks;
  // Default: ADMIN and MANAGER can assign tasks
  return isAdmin(user) || isManager(user);
}

/**
 * Check if user can manage users in their organization
 * Falls back to role-based check if permission not explicitly set
 */
export function canManageUsers(user: UserWithPermissions): boolean {
  if (user.canManageUsers !== undefined) return user.canManageUsers;
  // Default: Only ADMIN can manage users
  return isAdmin(user);
}

// ============================================
// Task creation scope helpers
// ============================================

const SCOPE_HIERARCHY = ['NONE', 'SELF', 'SPACE', 'ORG'] as const;

/**
 * Check if user's taskCreationScope is at least the given scope level.
 * Falls back to 'NONE' if taskCreationScope is not set.
 */
export function canCreateTaskFor(user: UserWithPermissions, scope: 'SELF' | 'SPACE' | 'ORG'): boolean {
  const userScope = user?.taskCreationScope || 'NONE';
  return SCOPE_HIERARCHY.indexOf(userScope as typeof SCOPE_HIERARCHY[number]) >= SCOPE_HIERARCHY.indexOf(scope);
}

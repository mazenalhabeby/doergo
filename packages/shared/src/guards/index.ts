/**
 * Shared Guard Utilities
 *
 * Helper functions for role-based and permission-based authorization.
 * Note: RolesGuard class must be defined in each app due to NestJS DI requirements.
 */

import { Role, Platform } from '../types';

// ============================================
// Role-based helpers
// ============================================

/**
 * Helper to check if a user has a specific role
 * Useful for conditional logic within services
 */
export function hasRole(user: { role: string }, ...roles: Role[]): boolean {
  // Handle backward compatibility: CLIENT maps to ADMIN
  const normalizedRole = user.role === 'CLIENT' ? Role.ADMIN : user.role;
  return roles.some((role) => normalizedRole === role || (role === Role.ADMIN && user.role === 'CLIENT'));
}

/**
 * Helper to check if user is an ADMIN (organization owner)
 */
export function isAdmin(user: { role: string }): boolean {
  return user.role === Role.ADMIN || user.role === Role.CLIENT; // CLIENT is deprecated alias
}

/**
 * Helper to check if user is a CLIENT
 * @deprecated Use isAdmin() instead
 */
export function isClient(user: { role: string }): boolean {
  return isAdmin(user); // Alias for backward compatibility
}

/**
 * Helper to check if user is a DISPATCHER
 */
export function isDispatcher(user: { role: string }): boolean {
  return user.role === Role.DISPATCHER;
}

/**
 * Helper to check if user is a TECHNICIAN
 */
export function isTechnician(user: { role: string }): boolean {
  return user.role === Role.TECHNICIAN;
}

// ============================================
// Platform-based helpers
// ============================================

/**
 * Check if user can access a specific platform
 */
export function canAccessPlatform(
  user: { platform?: string },
  targetPlatform: 'WEB' | 'MOBILE'
): boolean {
  if (!user.platform) return true; // Default allow if platform not set (backward compat)
  return user.platform === Platform.BOTH || user.platform === targetPlatform;
}

/**
 * Check if user can access web platform
 */
export function canAccessWeb(user: { platform?: string }): boolean {
  return canAccessPlatform(user, 'WEB');
}

/**
 * Check if user can access mobile platform
 */
export function canAccessMobile(user: { platform?: string }): boolean {
  return canAccessPlatform(user, 'MOBILE');
}

// ============================================
// Permission-based helpers
// ============================================

interface UserWithPermissions {
  role: string;
  canCreateTasks?: boolean;
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
  // Default: ADMIN and DISPATCHER can view all tasks
  return isAdmin(user) || isDispatcher(user);
}

/**
 * Check if user can assign tasks to technicians
 * Falls back to role-based check if permission not explicitly set
 */
export function canAssignTasks(user: UserWithPermissions): boolean {
  if (user.canAssignTasks !== undefined) return user.canAssignTasks;
  // Default: ADMIN and DISPATCHER can assign tasks
  return isAdmin(user) || isDispatcher(user);
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

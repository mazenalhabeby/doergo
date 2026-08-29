/**
 * Role and permission helpers — PURE, and deliberately separate from
 * `guards/index.ts`.
 *
 * That file re-exports the NestJS guard classes, so anything importing it drags
 * @nestjs/common in. These functions have no such dependency and the browser
 * genuinely needs them: the web app must be able to ask "is this user an admin?"
 * to decide what to render, and the alternative — reimplementing the role
 * normalisation client-side — is the version that drifts from what the server
 * enforces.
 *
 * Re-exported from `guards/index.ts`, so every existing import keeps working.
 */
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

/** Check if user is an external CUSTOMER (customer portal persona) */
export function isCustomer(user: { role: string }): boolean {
  return normalizeRole(user.role) === Role.CUSTOMER;
}

/** True for internal staff (ADMIN or EMPLOYEE) — i.e. NOT an external customer */
export function isStaff(user: { role: string }): boolean {
  return !isCustomer(user);
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

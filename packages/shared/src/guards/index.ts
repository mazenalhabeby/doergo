/**
 * Shared Guard Utilities
 *
 * Helper functions for role-based authorization.
 * Note: RolesGuard class must be defined in each app due to NestJS DI requirements.
 */

import { Role } from '../types';

/**
 * Helper to check if a user has a specific role
 * Useful for conditional logic within services
 */
export function hasRole(user: { role: string }, ...roles: Role[]): boolean {
  return roles.some((role) => user.role === role);
}

/**
 * Helper to check if user is a CLIENT
 */
export function isClient(user: { role: string }): boolean {
  return user.role === Role.CLIENT;
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

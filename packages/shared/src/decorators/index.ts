/**
 * Shared NestJS Decorators
 *
 * Reusable decorators for authentication, authorization, and parameter extraction.
 * These can be used across multiple services.
 */

import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role, Platform, TechnicianType } from '../types';

// =============================================================================
// METADATA KEYS
// =============================================================================

/**
 * Key for storing roles metadata
 */
export const ROLES_KEY = 'roles';

/**
 * Key for marking routes as public (no auth required)
 */
export const IS_PUBLIC_KEY = 'isPublic';

// =============================================================================
// DECORATORS
// =============================================================================

/**
 * Decorator to specify required roles for a route
 *
 * @example
 * @Roles(Role.DISPATCHER, Role.CLIENT)
 * @Get('tasks')
 * getTasks() {}
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Decorator to mark a route as public (no authentication required)
 *
 * @example
 * @Public()
 * @Post('login')
 * login() {}
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// =============================================================================
// CURRENT USER
// =============================================================================

/**
 * User data attached to request by JWT auth guard
 */
export interface CurrentUserData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role | string;
  organizationId: string;
  // Permission fields
  platform: Platform | string;
  canCreateTasks: boolean;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  // Technician-specific fields
  technicianType?: TechnicianType;
}

/**
 * Parameter decorator to extract current user from request
 *
 * @example
 * // Get full user object
 * @Get('profile')
 * getProfile(@CurrentUser() user: CurrentUserData) {}
 *
 * @example
 * // Get specific property
 * @Get('my-tasks')
 * getMyTasks(@CurrentUser('id') userId: string) {}
 */
export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserData | undefined, ctx: ExecutionContext): CurrentUserData | unknown => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserData;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);

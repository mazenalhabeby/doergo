/**
 * RolesGuard - must be in gateway due to NestJS DI requirements
 * Helper functions are exported from @doergo/shared
 */
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, ROLES_KEY } from '@doergo/shared';

// Re-export helper functions from shared
export { hasRole, isClient, isDispatcher, isTechnician } from '@doergo/shared';

/**
 * Guard to check if user has required role(s)
 *
 * Use with @Roles() decorator to specify required roles.
 * Must be used AFTER JwtAuthGuard to ensure user is attached to request.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No roles required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('User not found in request');
    }

    const hasRole = requiredRoles.some((role: Role) => user.role === role);

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}

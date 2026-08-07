/**
 * PermissionsGuard - Permission-based access control
 *
 * Checks that the authenticated user has all required permissions
 * specified by the @RequirePermission() decorator.
 *
 * - If no permissions are required on the handler, access is allowed.
 * - ADMIN role always passes (they have all permissions by default).
 * - For other roles, all listed permission fields must be `true` on the user.
 *
 * Note: Like RolesGuard, this must be instantiated in each app due to NestJS DI.
 * The shared package provides the implementation that can be directly used.
 */
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, type PermissionField } from '../decorators';
import { IS_PUBLIC_KEY } from '../decorators';
import { isAdmin } from './index';
import { accessAllows, type AccessPermissionKey, type ResolvedAccess } from '../types/permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip for @Public() routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<PermissionField[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permissions required, allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    // No user = let other guards handle it
    if (!user) {
      return true;
    }

    // ADMIN role always has all permissions
    if (isAdmin(user)) {
      return true;
    }

    // A permission is satisfied by EITHER the legacy user flag or the unified
    // resolved ORG access (which is itself a superset of the flags). Only
    // ORG-level access is honored here — per-space grants are enforced in the
    // service layer against the resource's own space, never a client-supplied
    // one, so this guard can never be tricked into approving an action on a
    // space the caller doesn't control.
    const access = (user.access as ResolvedAccess | undefined) ?? undefined;
    const missingPermissions = requiredPermissions.filter(
      (permission) =>
        user[permission] !== true &&
        !accessAllows(access, permission as AccessPermissionKey),
    );

    if (missingPermissions.length > 0) {
      throw new ForbiddenException(
        `Access denied. Missing permissions: ${missingPermissions.join(', ')}`,
      );
    }

    return true;
  }
}

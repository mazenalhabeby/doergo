import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, PERMISSIONS_IN_SPACE_KEY, type PermissionField, IS_PUBLIC_KEY } from '@hbcfield/shared';
import { isAdmin, accessAllowsAnywhere } from '@hbcfield/shared';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredPermissions = this.reflector.getAllAndOverride<PermissionField[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    // Space-aware variant: also satisfied by a per-space / cross-org-shared grant.
    // The guard only WIDENS; the service re-checks the resource's real spaceId.
    const inSpacePermissions = this.reflector.getAllAndOverride<PermissionField[]>(
      PERMISSIONS_IN_SPACE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      (!requiredPermissions || requiredPermissions.length === 0) &&
      (!inSpacePermissions || inSpacePermissions.length === 0)
    ) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) return true;
    if (isAdmin(user)) return true;

    // Org-wide required permissions: must be held as a flat org flag.
    const missing = (requiredPermissions ?? []).filter((p) => !user[p]);
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permissions: ${missing.join(', ')}`);
    }

    // Space-aware permissions: held org-wide OR in ANY space (incl. shared).
    const missingInSpace = (inSpacePermissions ?? []).filter(
      (p) => !user[p] && !accessAllowsAnywhere(user.access, p as any),
    );
    if (missingInSpace.length > 0) {
      throw new ForbiddenException(`Missing permissions: ${missingInSpace.join(', ')}`);
    }

    return true;
  }
}

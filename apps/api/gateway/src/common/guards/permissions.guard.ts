import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, PERMISSIONS_IN_SPACE_KEY, type PermissionField, IS_PUBLIC_KEY } from '@hbcfield/shared';
import { isAdmin, accessAllowsAnywhere, accessAllowsInSpace } from '@hbcfield/shared';

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

    /*
      Space-aware permissions.

      When the route names a concrete space, the grant must be in THAT space.
      This used to accept a grant in ANY space and leave the service to re-check
      — but the workflow services only check TENANCY, so a member who manages
      one space could attach, fork or remove task types in every other space of
      the organization. "The guard only widens" is only safe when something
      downstream narrows again, and here nothing did.

      Falls back to the old any-space test when no space is named, which is the
      case the decorator was written for.
    */
    const req = context.switchToHttp().getRequest();
    const spaceId: string | undefined =
      req.params?.spaceId ?? req.params?.locationId ?? req.body?.spaceId;

    const missingInSpace = (inSpacePermissions ?? []).filter((p) => {
      if (user[p]) return false;
      return spaceId
        ? !accessAllowsInSpace(user.access, p as any, spaceId)
        : !accessAllowsAnywhere(user.access, p as any);
    });
    if (missingInSpace.length > 0) {
      throw new ForbiddenException(`Missing permissions: ${missingInSpace.join(', ')}`);
    }

    return true;
  }
}

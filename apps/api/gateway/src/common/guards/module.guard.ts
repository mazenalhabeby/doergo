import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, hasFeatureModule } from '@hbcfield/shared';
import { MODULE_KEY } from '../decorators/require-module.decorator';

/**
 * Rejects requests whose required FEATURE module is not enabled for the user's
 * organization. Reads the module set carried on the token (user.orgModules),
 * so it's the same source the UI gates on — no extra DB hit.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest();
    // Reads never hard-break on a downgrade — only gate mutations (mirrors PlanGuard).
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    const user = req.user;
    if (!user) return true;

    if (!hasFeatureModule(user, required)) {
      throw new ForbiddenException(
        `The "${required}" module is not enabled for your organization`,
      );
    }
    return true;
  }
}

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { isAdmin } from '@hbcfield/shared';

/**
 * Report access = admin OR canViewAllTasks OR canViewReports. The per-user
 * `canViewReports` flag is granted to Show-in-Management members via the Access
 * Builder — so a member who isn't a full manager can still be allowed to make
 * reports. (The standard PermissionsGuard is AND-only, hence this OR guard.)
 */
@Injectable()
export class ReportAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;
    if (isAdmin(user) || user.canViewAllTasks || user.canViewReports) return true;
    throw new ForbiddenException('You do not have access to reports');
  }
}

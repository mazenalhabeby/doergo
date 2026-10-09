import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { isAdmin, accessAllowsAnywhere, spacesGranting } from '@hbcfield/shared';

/**
 * WHERE a report reader may read: the spaces granting canViewReports or
 * canViewAllTasks, merged. `null` = org-wide (an admin, or either permission
 * held org-wide); `[]` = nowhere; `[ids]` = only those.
 *
 * ⚠️ The guard below only WIDENS — it admits somebody holding either
 * permission in ANY workspace. Reports were then org-scoped downstream and
 * nothing more, so a supervisor of one site read every person's hours, leave
 * and jobs across the organization. This list is what the query engine and the
 * timesheet narrow to.
 */
export function reportSpaceScope(user: any): string[] | null {
  if (isAdmin(user)) return null;
  const reports = spacesGranting(user?.access, 'canViewReports');
  const tasks = spacesGranting(user?.access, 'canViewAllTasks');
  if (reports === null || tasks === null) return null;
  return [...new Set([...reports, ...tasks])];
}

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
    // Admin, the legacy flags, OR a unified role granting reports (org-wide or in
    // any space). Admission only — WHAT they read is narrowed to
    // `reportSpaceScope(user)` downstream, and external members never reach
    // here (@DenyExternal on the controller).
    if (
      isAdmin(user) ||
      user.canViewAllTasks ||
      user.canViewReports ||
      accessAllowsAnywhere(user.access, 'canViewReports') ||
      accessAllowsAnywhere(user.access, 'canViewAllTasks')
    ) {
      return true;
    }
    throw new ForbiddenException('You do not have access to reports');
  }
}

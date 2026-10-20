import { Role } from '@hbcfield/shared';
import { scopeFor } from '../../common/permission-scope';
import type { SessionUser } from '../../common/request.types';

/**
 * Whose LEAVE this caller decides — approving a request, adjusting a balance, starting balances:
 * the rota permission. Undefined = org-wide (an administrator, or the permission held org-wide),
 * [ids] = the people of those workspaces (narrowed in task-service), [] = nobody.
 */
function leaveWriteScope(user: SessionUser | undefined): string[] | undefined {
  return scopeFor(user, 'canManageRota') ?? undefined;
}

/** Whose leave this caller may READ besides their own: the rota permission or the view permission. */
function leaveReadScope(user: SessionUser | undefined): string[] | undefined {
  const rota = scopeFor(user, 'canManageRota');
  const view = scopeFor(user, 'canViewAllTasks');
  if (user?.role === Role.ADMIN || rota === null || view === null) return undefined;
  return [...new Set([...(rota ?? []), ...(view ?? [])])];
}

export { leaveWriteScope, leaveReadScope };

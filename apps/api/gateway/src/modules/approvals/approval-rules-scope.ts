import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { scopeFor } from '../../common/permission-scope';
import type { AuthedRequest, SessionUser } from '../../common/request.types';

/**
 * Office rules decide who may finish a decision, so they are the organization's own policy: an administrator,
 * or "manage approval rules" (bridged from canManageUsers org-wide, so nobody lost it when it was split out).
 * Held in some workspaces only → those workspaces' rules (undefined = org-wide). Never through a stand-in —
 * the key is not one a stand-in can hold — and never an external member (not on the external allow-list).
 */
export function rulesScope(user: SessionUser): string[] | undefined {
  const scope = scopeFor(user, 'canManageApprovalRules');
  if (scope && !scope.length) throw new ForbiddenException('Only somebody who may manage approval rules can do this');
  return scope ?? undefined;
}

/** The same rule as a guard — it runs BEFORE the body is validated, so a refusal never describes the body. */
@Injectable()
export class ApprovalRulesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    rulesScope(context.switchToHttp().getRequest<AuthedRequest>().user);
    return true;
  }
}

import { ForbiddenException } from '@nestjs/common';
import { isAdmin, accessAllows } from '@hbcfield/shared';
import { spaceMemberAuthority } from '../space-roles/space-member-access';

import type { AuthedRequest } from '../../common/request.types';

/**
 * May the caller change who works in THIS workspace?
 *
 * The guard on `POST /locations/:id/members` reads a space id from
 * `params.spaceId`, `params.locationId` or the body — never `:id` — so for
 * this route it fell back to "granted in ANY space": a member who manages one
 * site could add people (and their roles, and their seat price) to every
 * other. Decided here against the space in the path.
 *
 * Two ways to hold it: the workspace grant the guard asks for, held org-wide
 * or in this space; or managing this space's people (which is what a CONTROL
 * guest holds in a space shared with them — the service then confines them
 * to their own people).
 */
export function assertMayManageMembersIn(req: AuthedRequest, spaceId: string): void {
  if (isAdmin(req.user)) return;
  if (accessAllows(req.user?.access, 'canManageWorkspaces', spaceId)) return;
  // Adding people here (`canAddSpaceMembers`), or managing its people — one rule with the space-roles routes.
  if (spaceMemberAuthority(req.user, spaceId).addMembers) return;
  throw new ForbiddenException('You do not have permission to manage the members of this workspace');
}

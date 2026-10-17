import { ForbiddenException } from '@nestjs/common';
import { mayManageSpaceMembers } from '@hbcfield/shared';

import type { SessionUser } from '../../common/request.types';
/**
 * May the caller manage THIS space's people — the one shared rule
 * (`mayManageSpaceMembers`: admin, org-wide `canManageUsers`, or `canManageUsers`
 * granted in this exact space). The spaceId is the route param = the resource
 * being acted on, so this is not a confused-deputy. It was a local copy of the
 * same rule; one definition means the roster's bill-rate strip and these routes
 * cannot drift apart.
 */
const canManageSpace = (user: SessionUser, spaceId: string): boolean => mayManageSpaceMembers(user, spaceId);

function assertCanManageSpace(user: SessionUser, spaceId: string) {
  if (!canManageSpace(user, spaceId)) {
    throw new ForbiddenException('You do not manage this space');
  }
}

export { canManageSpace, assertCanManageSpace };

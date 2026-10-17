import { getSpaceScope, isAdmin, stripWorkspaceTerms, type SpaceScope } from '@hbcfield/shared';

import type { SessionUser } from '../../common/request.types';
/**
 * Which workspaces `GET /locations` lists for this caller.
 *
 * ⚠️ An EXTERNAL member is never widened to the organization's directory. The
 * org-wide `canViewAllTasks` column and an Access Profile left at "all" both
 * meant "every workspace" — right for staff, wrong for a client's supervisor,
 * whose whole authority is the space role they hold where they are assigned.
 * So they get 'own' (the spaces they are assigned to — which is where their
 * space role lives), or nothing if their profile says 'tasks'.
 */
export function locationListScope(user: SessionUser): SpaceScope {
  if (user?.isExternal === true && !isAdmin(user)) {
    return getSpaceScope(user) === 'tasks' ? 'tasks' : 'own';
  }
  return user?.canViewAllTasks ? 'all' : getSpaceScope(user ?? {});
}

/**
 * The list as an external member receives it: no workspace rates or costs
 * (`stripWorkspaceTerms`) — what the organization charges a site, and what it
 * costs, is not a client's business. Staff rows pass unchanged.
 */
export function shapeLocationList<T>(result: T, user: SessionUser): T {
  const r = result as { data?: unknown };
  if (user?.isExternal !== true || isAdmin(user) || !Array.isArray(r?.data)) return result;
  return { ...r, data: r.data.map((row: unknown) => stripWorkspaceTerms(row, false)) } as T;
}

/** What somebody who manages a workspace's people (not the workspace) may change on a member: the automatic clock only. */
const AUTO_CLOCK_MEMBER_FIELDS = new Set(['autoClock', 'autoClockMode', 'autoClockStartWindow']);

export { AUTO_CLOCK_MEMBER_FIELDS };

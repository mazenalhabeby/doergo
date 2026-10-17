/**
 * spaceMembers — web-only routes (the browser's screens; the phone does not call them).
 * Read raw by apps/web-app/src/lib/api (`unwrap: 'raw'`), which types each answer
 * where it calls; `R` stays `unknown` here until a second app needs it.
 */
import { defineEndpoints, endpoint } from '../../core/define';
import { path } from '../../core/path';

export const spaceMembersWebEndpoints = defineEndpoints('spaceMembers', {
  list: endpoint<{ spaceId: string }, unknown>({ method: 'GET', path: (a) => path`/spaces/${a.spaceId}/members` }),
  assign: endpoint<{ spaceId: string }, unknown, unknown>({
    method: 'POST',
    path: (a) => path`/spaces/${a.spaceId}/members`,
  }),
  remove: endpoint<{ spaceId: string; memberId: string }, unknown, unknown>({
    method: 'DELETE',
    path: (a) => path`/spaces/${a.spaceId}/members/${a.memberId}`,
  }),
  updateRate: endpoint<{ spaceId: string; memberId: string }, unknown, unknown>({
    method: 'PATCH',
    path: (a) => path`/spaces/${a.spaceId}/members/${a.memberId}/rate`,
  }),
  updateRoles: endpoint<{ spaceId: string; memberId: string }, unknown, unknown>({
    method: 'PATCH',
    path: (a) => path`/spaces/${a.spaceId}/members/${a.memberId}/roles`,
  }),
  /** What one person may do in this workspace, as the permission builder shows it. */
  getPermissions: endpoint<{ spaceId: string; assignmentId: string }, unknown>({
    method: 'GET',
    path: (a) => path`/spaces/${a.spaceId}/members/${a.assignmentId}/permissions`,
  }),
  /** Set it: `{ roleId }` (a shared role) or `{ permissions }` (their own set). */
  setPermissions: endpoint<{ spaceId: string; assignmentId: string }, unknown, unknown>({
    method: 'PUT',
    path: (a) => path`/spaces/${a.spaceId}/members/${a.assignmentId}/permissions`,
  }),
  updateRouting: endpoint<{ spaceId: string; memberId: string }, unknown, unknown>({
    method: 'PATCH',
    path: (a) => path`/spaces/${a.spaceId}/members/${a.memberId}/routing`,
  }),
});

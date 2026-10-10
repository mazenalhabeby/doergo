/**
 * spaceRoles — web-only routes (the browser's screens; the phone does not call them).
 * Read raw by apps/web-app/src/lib/api (`unwrap: 'raw'`), which types each answer
 * where it calls; `R` stays `unknown` here until a second app needs it.
 */
import { defineEndpoints, endpoint } from '../../core/define';
import { path } from '../../core/path';

export const spaceRolesWebEndpoints = defineEndpoints('spaceRoles', {
  list: endpoint<void, unknown>({ method: 'GET', path: () => '/space-roles' }),
  listInSpace: endpoint<{ spaceId: string }, unknown>({ method: 'GET', path: (a) => path`/spaces/${a.spaceId}/roles` }),
  setDayRate: endpoint<{ spaceId: string; roleId: string }, unknown, unknown>({ method: 'PUT', path: (a) => path`/spaces/${a.spaceId}/roles/${a.roleId}/day-rate` }),
  setDefaultDayRate: endpoint<{ roleId: string }, unknown, unknown>({ method: 'PUT', path: (a) => path`/space-roles/${a.roleId}/day-rate` }),
  create: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/space-roles' }),
  update: endpoint<{ id: string }, unknown, unknown>({ method: 'PATCH', path: (a) => path`/space-roles/${a.id}` }),
  remove: endpoint<{ id: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/space-roles/${a.id}` }),
  useHere: endpoint<{ spaceId: string; roleId: string }, unknown, unknown>({ method: 'PUT', path: (a) => path`/spaces/${a.spaceId}/work-roles/${a.roleId}` }),
  dropHere: endpoint<{ spaceId: string; roleId: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/spaces/${a.spaceId}/work-roles/${a.roleId}` }),
  merge: endpoint<{ roleId: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/space-roles/${a.roleId}/merge` }),
});
